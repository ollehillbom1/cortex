# ADR 0010: Per-device sync keys (v4), device list and revocation

- **Status**: proposed — decision needed before any code is written
- **Date**: 2026-08-04
- **Supersedes parts of**: [ADR 0007](0007-sync-backend.md) (v2), and the v3
  protocol shipped in #58
- **Related**: SEC-01 (v3 random identity), SEC-02 (write capability, #78)

## Context

v3 fixed what v2 got wrong: a group's identity is a random 128-bit seed
shown once as a sync code, so two households can no longer collide and the
public endpoint cannot be used to test guesses. SEC-02 then separated the
write capability from the group id, so a leaked locator can no longer
overwrite a household's data.

One property survived all of it: **the sync code is the whole identity, and
every device holds the same one.** Everything below follows from that.

- **There is no device list.** Nobody can answer "what is connected to our
  sync group?" — not the user, not the server operator, not the app.
- **There is no revocation.** A lost or sold phone keeps full read and write
  access for ever. The only remedy today is creating a new group and
  re-joining every remaining device by hand; the old server record stays
  readable to whoever holds the old code, because that code _is_ the key.
- **There is no rotation.** A code that leaks once — a screenshot, a chat
  message, a photo of a note — is permanent access to all future data.

For a household of two to four devices this is not catastrophic, and it is
worth saying plainly: the realistic threat is not an attacker, it is a
**lost phone** and a **code that was shared once and cannot be unshared**.

## Decision (proposed)

Move the identity from "one secret everyone shares" to **one data key,
wrapped separately for each device**.

### The key material

- **Group data key (GDK)**: a random AES-GCM-256 key, generated at group
  creation. All payloads are encrypted with it, exactly as today. It is
  never transmitted in the clear and never derived from anything a person
  chose.
- **Device keypair**: every device generates an **ECDH P-256** keypair on
  first join, private key stored non-extractable in IndexedDB. P-256 rather
  than X25519 because WebCrypto support for X25519 is still uneven on the
  primary target (iOS Safari), and an offline PWA cannot ship a polyfill it
  would have to be trusted about.
- **Keyslot**: `{ deviceId, label, devicePublicKey, ephemeralPublicKey, iv,
wrappedGdk, addedAt }`. The GDK wrapped to that device: ECDH(ephemeral,
  devicePublic) → HKDF → AES-GCM. The server stores the slots next to the
  ciphertext and can decrypt none of them.
- **Recovery slot**: the GDK wrapped under a key derived from a **recovery
  code** the user is prompted to save, with the same entropy and format as
  today's sync code. This is non-negotiable and is the reason v3 shipped at
  all: without it, a household whose last device dies has no way back. The
  difference from v3 is that this code is **only** recovery — it is no
  longer the day-to-day identity, so it is never typed into a second device
  in normal use and has far fewer chances to leak.

### Joining, without trusting the server

The obvious design — "the new device posts its public key, an existing
device wraps the GDK for it" — has a hole: the server can substitute its
own public key for the newcomer's and receive a slot it can open. Comparing
fingerprints on both screens closes it, but only if the user actually does.

Instead, trust comes from the same out-of-band step users already perform:

1. Device A generates a single-use **invite secret** (high entropy, shown as
   a short code, expires in 10 minutes) and pushes a pending slot with the
   GDK wrapped under a key derived from that secret.
2. Device B is given the code by a human, derives the same key, unwraps the
   GDK, and then **installs its own permanent slot** — it can, because it
   now holds the GDK.
3. The pending slot is deleted on first successful use.

The server never sees the invite secret, so a substituted public key gains
it nothing. The user experience is identical to today's "type this code on
the other device", which is what makes it likely to be used correctly.

### Revocation

Removing a device is: delete its keyslot, **generate a new GDK**, re-wrap
for the remaining slots, re-encrypt the current state, and increment a
`keyEpoch`. A revoked device can still read the ciphertext it already
downloaded — nothing can change that — but it cannot read anything written
afterwards, and its write capability (SEC-02) is rotated with the epoch, so
it cannot corrupt the group either.

Rotation happens **on revocation only**. Scheduled rotation without a reason
would be theatre: it costs a full re-encrypt and a chance of locking
everyone out, and defends against nothing that revocation does not.

### Migration from v3

Additive, and reversible until the user says otherwise:

1. On upgrade, the current v3 key becomes the initial GDK. The upgrading
   device creates its own keyslot and a recovery slot from a newly generated
   recovery code (prompted, saved, confirmed — as in #58).
2. The **v3 sync code stays valid as a legacy slot**, so devices that have
   not upgraded keep working. The device list shows it as "old sync code —
   still has access".
3. When every device is listed and upgraded, the user revokes the legacy
   slot in one tap. That is the moment the old code stops working, and the
   UI must say so in those words.

No data is re-encrypted until step 3, so an interrupted migration leaves a
working group rather than a half-locked one.

## Consequences

- The user gains: a device list, "this phone is lost — remove it", and a
  code that can be made worthless after a leak. Those are the three things
  they cannot do today.
- The server operator gains metadata they did not have: how many devices a
  group has, their labels and public keys, when each joined. This is a real
  (small) privacy regression and must be documented in PRIVACY.md rather
  than glossed over.
- The protocol surface roughly triples: slots, epochs, invites, expiry,
  pending state. Every one of those is a way to lock a family out of their
  own history if it is wrong.
- Bundle and complexity cost is modest (WebCrypto does the work), but the
  **test** cost is not: this needs adversarial coverage of interrupted
  joins, concurrent revocations, and epoch skew between devices.

## The honest cost/benefit, and the recommendation

This is the largest change to the system's security-critical core since it
was written, made to a system that already holds a real household's real
history. The failure mode is not "a weakness remains"; it is "the data is
unreadable and nobody noticed until the day it was needed".

Recommended scope, in this order, each shippable on its own:

1. **Device list + labels** (read-only, no crypto change): make slots exist
   and be visible. Low risk, immediately useful, and it forces the storage
   shape to be right before anything depends on it.
2. **Revocation with rotation.** The actual goal.
3. **Recovery slot + prompted recovery code.** Must land with or before (2),
   never after — revocation without a recovery path is how a household
   locks itself out.

Explicitly **not** in scope: scheduled rotation, per-device read-only
access, server-enforced device limits, and any form of account.

## Alternatives considered

- **Keep v3, document the limitation.** Cheapest and not unreasonable for a
  four-device family; the lost-phone case stays unsolved.
- **Passphrase-wrapped key (the original SEC-01 sketch).** Solves rotation
  but not per-device revocation, because every device still holds the same
  unwrapping secret.
- **Accounts and server-side auth.** Solves everything and breaks the
  product: no accounts is a design promise, and it would make the operator
  able to lock users out.

## Open questions for the decision

1. Is the lost-phone case worth tripling the protocol surface, given the
   household is currently four devices and the server is on your own LAN?
2. Should the legacy v3 slot expire automatically after some period, or only
   ever be removed deliberately? (Automatic expiry protects the forgetful
   household and can strand a device that was simply off for a month.)
3. Device labels are user-supplied and visible to the operator. Free text,
   or a fixed list ("phone", "tablet", "laptop") to limit what leaks?
