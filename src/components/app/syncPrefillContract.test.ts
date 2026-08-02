import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Two of the three ways into the passphrase dialog exist to REUSE a passphrase
 * the user already has:
 *
 *   - "Set up sync, or rejoin with your passphrase" — a reinstalled or new
 *     device rejoining an existing group.
 *   - "Upgrade sync security" — re-deriving the key for the group this device
 *     is already in.
 *
 * Pre-filling a freshly generated passphrase into either one is silent data
 * loss: the user taps Enable without clearing it, a different key is derived,
 * and everything already synced is orphaned under the old group id. This is
 * how the field was actually shipped on the branch, on both buttons.
 *
 * Asserted against the source rather than a rendered component because the
 * defect is in which handler calls what, and mounting this section means
 * standing up the whole storage and sync stack for a one-line invariant.
 */

const SOURCE = readFileSync(new URL("./SyncSection.tsx", import.meta.url), "utf8");

/**
 * Comments quote the very identifiers being asserted on ("Never generated
 * here: …"), so a naive substring search matches the explanation instead of
 * the code. Strip them first.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The body of the `onClick` whose button renders `label`. */
function onClickBodyForButton(src: string, label: string): string {
  const labelAt = src.indexOf(label);
  expect(labelAt, `button labelled ${label} not found`).toBeGreaterThan(-1);
  const onClickAt = src.lastIndexOf("onClick", labelAt);
  expect(onClickAt, `no onClick precedes ${label}`).toBeGreaterThan(-1);
  return src.slice(onClickAt, labelAt);
}

describe("passphrase pre-fill", () => {
  const src = stripComments(SOURCE);

  it.each([
    ["Set up sync, or rejoin with your passphrase"],
    ["Upgrade sync security"],
  ])("does not generate one when opening the dialog from %s", (label) => {
    const body = onClickBodyForButton(src, label);
    expect(body).not.toContain("generatePassphrase(");
    // A value left over from an earlier visit is the same trap.
    expect(body).toContain('setPassphrase("")');
    expect(body).toContain("setRevealPassphrase(false)");
  });

  it("still offers generation inside the dialog", () => {
    // PR #45's point stands: entropy is the only thing keeping two households
    // out of the same group, so generating must stay one tap away — just not
    // pre-applied to the flows that need an existing passphrase.
    expect(src).toContain("Generate a passphrase");
    const generateAt = src.indexOf("t(\"Generate another\")");
    expect(generateAt, "in-dialog generate button not found").toBeGreaterThan(-1);
    expect(src.lastIndexOf("generatePassphrase(", generateAt)).toBeGreaterThan(-1);
  });
});
