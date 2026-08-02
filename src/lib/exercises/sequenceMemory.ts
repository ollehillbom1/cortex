import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Sequence Memory: tiles light up in order; the user repeats the order.
 */

export interface SequenceParams {
  /** Grid is gridSize x gridSize. */
  gridSize: number;
  length: number;
  /** How long each tile stays lit during playback. */
  litMs: number;
  gapMs: number;
}

export function sequenceParams(level: number): SequenceParams {
  const gridSize = level < 7 ? 3 : 4;
  const length = 3 + Math.floor((level - 1) / 2);
  const litMs = Math.max(280, 600 - (level - 1) * 20);
  // Both timings bottomed out around level 17, after which every other
  // level changed nothing (length only moves on odd levels). The gap keeps
  // descending past that point at a gentler slope, with a floor that binds
  // exactly at the ceiling (39): every exposed step changes something.
  const gapMs =
    level <= 17 ? Math.max(120, 250 - (level - 1) * 8) : Math.max(76, 120 - (level - 17) * 2);
  return { gridSize, length, litMs, gapMs };
}

/** Cell indices, repeats allowed but never twice in a row. */
export function generateSequence(rng: Rng, params: SequenceParams): number[] {
  const cells = params.gridSize * params.gridSize;
  const seq: number[] = [];
  for (let i = 0; i < params.length; i++) {
    let c = randInt(rng, 0, cells - 1);
    while (i > 0 && c === seq[i - 1]) c = randInt(rng, 0, cells - 1);
    seq.push(c);
  }
  return seq;
}

export interface SequenceScore {
  accuracy: number;
  perfect: boolean;
  correctPrefix: number;
}

/** Scored on the longest correct prefix, like the presentation order. */
export function scoreSequenceResponse(expected: number[], response: number[]): SequenceScore {
  let correctPrefix = 0;
  for (let i = 0; i < expected.length; i++) {
    if (response[i] === expected[i]) correctPrefix++;
    else break;
  }
  const accuracy = expected.length === 0 ? 0 : correctPrefix / expected.length;
  return { accuracy, perfect: correctPrefix === expected.length, correctPrefix };
}
