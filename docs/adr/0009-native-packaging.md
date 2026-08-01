# ADR 0009: Native packaging — stay a PWA for now

- **Status**: accepted
- **Date**: 2026-08-01
- **Issue**: #12

## How to read this

Claims here are tagged, because the difference between "I read this in our
code" and "I believe this about iOS" matters a great deal for a decision like
this one.

| Tag          | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| **[code]**   | Verified by reading this repository while writing this ADR              |
| **[expect]** | Platform behaviour I am reasonably confident of but did **not** re-test |
| **[verify]** | Needs a real device, or a fresh read of current store policy            |

No version numbers, policy clause numbers, benchmark figures or store-review
anecdotes appear below. The issue asks for "measured findings (storage
persistence, startup time, audio behaviour in silent mode)" — those require an
iPhone and a build, so this ADR gives the **method** to obtain them rather
than inventing values. That is the honest reading of an evaluation written
without the hardware.

## Context

Issue #12 asks whether a thin native wrapper (Capacitor, PWABuilder/TWA, or a
React Native rewrite) is worth it, citing iOS PWA limits: storage eviction
pressure, no app-store distribution, restricted haptics and audio-session
control.

The stated use case is a household running Cortex on a self-hosted server,
primarily on iPhone, maintained by one person.

## What our code actually requires

Five properties constrain every option. All are **[code]**.

**1. The deployed artifact is a Node server, not a static bundle.**
`next.config.ts` sets `output: "standalone"`, and three runtime route handlers
exist: `/api/health`, `/api/sync/[groupId]`, `/api/coach`. A Capacitor or TWA
shell serves a static directory, which requires `output: "export"` — and that
cannot coexist with those handlers.

This contradicts the issue's own third acceptance criterion, _"No fork of the
web codebase — wrapper consumes the same build output."_ It cannot. A wrapper
needs a second build mode that excludes the API routes: not a fork of
application code, but a permanent second configuration for CI to build and for
someone to keep working.

**2. Server communication is origin-relative.** `src/lib/sync/engine.ts` fetches
`` `/api/sync/${groupId}` ``; `src/lib/coach/client.ts` fetches `/api/coach`.
Inside a bundled wrapper the document origin is a local scheme, so both resolve
to the app bundle rather than to the household server. Making sync work in a
wrapper means adding a configurable absolute server URL, settings UI to enter
it, CORS on the route handlers (there is none today), and a decision about
plain-HTTP LAN servers under iOS App Transport Security **[verify]**. That is a
feature, not wrapper plumbing.

**3. The security posture is delivered by HTTP headers.** The CSP and the other
headers in `next.config.ts` are applied by the Next server. A locally-served
bundle gets none of them. A `<meta http-equiv="Content-Security-Policy">` in
the bundled HTML recovers the CSP, but `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy` and `X-Frame-Options` have no meta
equivalent, and `connect-src 'self'` would have to widen to reach the server.
ADR 0005 would need a wrapper-specific rewrite.

**4. WebCrypto is used unguarded, for more than sync.** `src/lib/sync/crypto.ts`
and `src/lib/security/pin.ts` both call `crypto.subtle` with no capability
check. `crypto.subtle` is exposed only in secure contexts **[expect]**. If a
wrapper's custom-scheme origin is not treated as secure, **profile PINs break,
not only sync** — and there are long-standing reports of exactly this failure
under Capacitor's iOS scheme **[verify]**. Asserting `crypto.subtle !== undefined`
inside the shell is day-one work for any spike, and a plausible early stop.

**5. Audio is where a wrapper both wins and risks losing.**
`src/lib/audio/audio.ts` uses `window.AudioContext` with no `webkit` fallback,
schedules rhythm on `ctx.currentTime`, and speaks digits through
`speechSynthesis` behind a 2500 ms watchdog (the code says "safety timeout";
that `onend` is unreliable on iOS is **[expect]**, not something our source
states). `AuditoryGame` awaits `audio.unlock()` and, on failure, tells the user
to check their volume or silent switch. **That panel is the concrete,
user-visible cost of being a PWA on iOS**, and it is the strongest argument in
this evaluation for going native.

It is also the claim most often overstated. A native app can set an
`AVAudioSession` category that ignores the silent switch — but our audio
originates inside a WKWebView, and WKWebView has a documented history of not
honouring the host app's audio-session category **[verify]**. So the headline
native win is _plausible but unproven for our architecture_, and it is the
first thing any spike must test. If it fails, the main reason to wrap
evaporates.

**And the durability problem the issue cites is already mitigated three ways
[code]:** `navigator.storage.persist()` is requested at profile creation and
surfaced in Profile → Your data; end-to-end-encrypted sync to the household
server shipped in #19; JSON export/import has been there since the MVP. No
data-loss incident is recorded in this repo.

## Options

| Dimension                 | Stay PWA                                    | Capacitor (bundled)                                       | TWA (Android only)              | React Native rewrite                                    |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| Web Audio tone scheduling | Works today on the owner's iPhone           | Same WebKit engine; timing under WKWebView **[verify]**   | Same Chrome engine **[expect]** | **Does not exist** — the tone/rhythm graph is rewritten |
| SpeechSynthesis           | Works, with the watchdog                    | Plausible regression, not a guaranteed win **[verify]**   | Same as browser **[expect]**    | Native TTS, rewritten                                   |
| Silent-switch bypass      | Not available; the app says so honestly     | The main hoped-for win — **[verify]**, see above          | Not the constraint on Android   | Achievable, at the cost of everything else              |
| Haptics                   | No Vibration API in iOS Safari **[expect]** | Native haptics available                                  | Available                       | Available                                               |
| Storage durability        | `persist()` + sync + export **[code]**      | App-container storage, not evictable **[expect]**         | Same as PWA                     | Native storage                                          |
| Sync to the server        | Works, origin-relative **[code]**           | Needs server URL + CORS + ATS work                        | Works (real origin)             | Rewritten                                               |
| Security headers          | Full set from the server **[code]**         | Partial; meta CSP only                                    | Full (real origin)              | N/A                                                     |
| Install friction          | Share → Add to Home Screen                  | Store review, or sideload with a 7-day clock **[verify]** | Play listing + asset links      | Store review                                            |
| Cost to maintain          | Zero beyond the web app                     | Second build mode, certificates, store obligations        | Second build mode, Android only | A second application, permanently                       |

TWA is Android-only and Android is not the stated target, so it cannot be the
answer on its own — it would sit alongside, not replace, the iOS question.

A React Native rewrite is disqualified on scope alone: the exercises are built
on Web Audio scheduling, `performance.now()` timing and SVG charts. Rewriting
them for a household app is not a packaging decision, it is a different
project — and it would abandon the "server-independent core gameplay" property
the issue asks to preserve.

## Decision

**Stay a PWA. No wrapper for now.**

The one thing a wrapper would clearly buy — audio that ignores the silent
switch — is unproven for a WKWebView-hosted audio graph, and it is bought with
a second build mode, a new server-URL feature with CORS and ATS work, a
weakened header posture, a WebCrypto risk that reaches profile PINs, and
ongoing store obligations for a single maintainer. The problems the issue
cites as motivation (storage eviction, no backup path) have since been
addressed in the web app itself.

Nothing here says "never". It says the case is not yet made, and names exactly
what would make it.

## What would change this

Any one of these should reopen the question:

1. **Silent-switch audio is confirmed to work** through WKWebView with a native
   audio-session category. This is the decisive one.
2. **Real data loss** happens to a household member despite `persist()` and
   sync — the durability argument becomes concrete rather than theoretical.
3. **Distribution beyond self-hosters** becomes a goal. Everything above is
   reasoned for one household; an app intended for strangers has different
   economics, and a different (much heavier) claims-review burden given that
   this is a "cognitive training" app.
4. **Haptics on Reaction** turn out to matter for accessibility — see
   `docs/accessibility.md`, where a haptic GO signal is the missing non-visual
   pathway for that exercise.

## The spike, if it is reopened

Time-boxed, and ordered so it fails fast and cheap. Stop at the first hard no.

1. **Half a day — the audio question, alone.** A throwaway Capacitor shell
   loading a page that does nothing but play a scheduled tone and speak a
   digit. Set the `AVAudioSession` category natively. Flick the silent switch.
   _If audio does not survive the silent switch, stop: the main reason to wrap
   is gone._
2. **One hour — WebCrypto.** In the same shell, assert
   `crypto.subtle !== undefined` and round-trip an AES-GCM encrypt/decrypt.
   _If it is missing, stop, or accept losing profile PINs and sync._
3. **One day — the second build mode.** Prove `output: "export"` produces a
   loadable bundle with the API routes excluded, and that the app degrades
   sanely with no server configured.
4. **Then, and only then, measure** what the issue actually asks for, on a real
   device, and record the numbers here: cold-start time versus the installed
   PWA; IndexedDB survival across an app update and a week of disuse; audio
   behaviour with the silent switch on, during a phone call, and against
   background music.

Steps 1 and 2 are roughly a day and answer the decision. Everything after is
implementation, and should not begin before they pass.
