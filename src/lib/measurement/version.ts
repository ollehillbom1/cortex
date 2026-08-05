import type { ExerciseId } from "@/lib/domain/types";

/**
 * What a level MEANS, versioned.
 *
 * Cortex is a measurement app: its whole promise is that a chart of your
 * levels over months says something. That promise breaks silently whenever
 * the difficulty mapping changes — "level 20" in July and "level 20" in
 * August are then different tasks plotted on one line, and the line lies
 * about progress in either direction.
 *
 * This already happened here. Within two days the span exercises stopped
 * plateauing every other level, Sound Span began pacing by a parameter it
 * had been ignoring, and reaction time moved to painted-frame timing. Each
 * makes older records incomparable with newer ones, and nothing recorded
 * the boundary.
 *
 * So every result is stamped with the measurement version of its exercise,
 * and the statistics refuse to draw a trend across a boundary as if it were
 * continuous. Bump a version whenever the difficulty parameters or the
 * scoring change in a way that moves the number without the person having
 * changed — `version.test.ts` fingerprints every difficulty ladder and
 * fails until you do, so the version cannot quietly stop being true.
 *
 * (Constants only, no imports beyond the id type: this module is reached
 * from client components, and pulling the exercise modules or node:crypto
 * in here would drag both into the browser bundle.)
 */

/** Results written before versioning existed carry no stamp. */
export const UNKNOWN_MEASUREMENT_VERSION = 0;

/**
 * Current measurement version per exercise.
 *
 * Everything starts at 1. The changes listed above all landed BEFORE
 * stamping began, so the honest statement about older data is not "it was
 * version 0" but "we do not know which mapping produced it" — which is
 * exactly what UNKNOWN_MEASUREMENT_VERSION means and what the UI says.
 *
 * Ledger — add a line with every bump:
 *   1 (2026-08-04) first stamped version. Mappings as of the span-ramp fix
 *     (#62), the auditory pacing fix (#77), painted-frame reaction timing
 *     (#51) and the per-exercise ceilings (#48).
 *   2 (2026-08-05) reaction-time and rhythm-recall only: responses are now
 *     timestamped on pointerdown instead of click. On touch devices `click`
 *     waits for the browser to rule out a scroll — and is discarded when it
 *     rules one in — so every earlier touch measurement carries the
 *     browser's arbitration delay on top of the person's reaction, and some
 *     rounds recorded a tap that was actually the SECOND attempt. Era 1
 *     numbers are therefore systematically slow and cannot be compared with
 *     era 2. Nothing about the difficulty changed, so the fingerprints do
 *     not move.
 */
export const MEASUREMENT_VERSION: Record<ExerciseId, number> = {
  "number-span": 1,
  "sequence-memory": 1,
  "visual-pattern": 1,
  "n-back": 1,
  "dual-n-back": 1,
  "auditory-digits": 1,
  "tone-pattern": 1,
  "rhythm-recall": 2,
  "reaction-time": 2,
};

/**
 * Fingerprint of each exercise's difficulty ladder (its parameters at every
 * level it exposes), as verified by version.test.ts. A changed ramp changes
 * the fingerprint; the test then fails and names the exercise whose
 * MEASUREMENT_VERSION needs bumping.
 */
export const DIFFICULTY_FINGERPRINT: Record<ExerciseId, string> = {
  "number-span": "72b2ce9bcc21bbd7",
  "sequence-memory": "471ee77db7352fb6",
  "visual-pattern": "df4e3e5936f0e90e",
  "n-back": "91c48b451f47f013",
  "dual-n-back": "6979e700e3db13b8",
  "auditory-digits": "c4860a43535993f5",
  "tone-pattern": "c37c37067ef0803f",
  "rhythm-recall": "0d44aed94f3da908",
  "reaction-time": "59db8f21be3a3187",
};

/** True when these results cannot honestly be plotted on one line. */
export function spansMeasurementBreak(versions: readonly (number | undefined)[]): boolean {
  const seen = new Set(versions.map((v) => v ?? UNKNOWN_MEASUREMENT_VERSION));
  return seen.size > 1;
}
