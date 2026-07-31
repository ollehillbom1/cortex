import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Tone Pattern: a melody plays on labelled sound pads; the user replays it
 * by ear. First-class version of the Sound Span tone fallback (issue #4).
 */

export interface TonePatternParams {
  /** Number of distinct pads/tones in play. */
  pads: number;
  /** Notes in the melody. */
  length: number;
  /** Duration of each note during playback. */
  noteMs: number;
  gapMs: number;
}

export function tonePatternParams(level: number): TonePatternParams {
  const pads = level < 6 ? 4 : level < 12 ? 5 : 6;
  const length = Math.min(12, 3 + Math.floor((level - 1) / 2));
  const noteMs = Math.max(280, 480 - (level - 1) * 12);
  const gapMs = Math.max(110, 220 - (level - 1) * 7);
  return { pads, length, noteMs, gapMs };
}

/** Pad indices, no immediate repeats so every note is audibly distinct. */
export function generateMelody(rng: Rng, params: TonePatternParams): number[] {
  const melody: number[] = [];
  for (let i = 0; i < params.length; i++) {
    let pad = randInt(rng, 0, params.pads - 1);
    while (i > 0 && pad === melody[i - 1]) pad = randInt(rng, 0, params.pads - 1);
    melody.push(pad);
  }
  return melody;
}

export interface MelodyScore {
  accuracy: number;
  perfect: boolean;
  correctPrefix: number;
}

/** Longest correct prefix, like the other sequence exercises. */
export function scoreMelodyResponse(expected: number[], response: number[]): MelodyScore {
  let correctPrefix = 0;
  for (let i = 0; i < expected.length; i++) {
    if (response[i] === expected[i]) correctPrefix++;
    else break;
  }
  const accuracy = expected.length === 0 ? 0 : correctPrefix / expected.length;
  return { accuracy, perfect: correctPrefix === expected.length, correctPrefix };
}
