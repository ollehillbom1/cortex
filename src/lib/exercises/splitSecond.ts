import { randInt, shuffle, type Rng } from "@/lib/engine/rng";

/**
 * Split Second: a brief flash shows a symbol at the centre while a diamond
 * appears somewhere on a ring of eight positions — then everything is
 * masked, and both must be reported. Inspired by the useful-field-of-view
 * paradigm (central discrimination + peripheral localisation under time
 * pressure), with the honesty caveat stated in the instructions and docs:
 * what is measured is the exposure your eyes handle IN HERE, on your
 * screen, at your sizes — nothing about driving or the world.
 */

export interface SplitSecondParams {
  /** Flashes per round. */
  trials: number;
  /** How long the stimulus is on screen. */
  exposureMs: number;
  /** Mask duration after the flash. */
  maskMs: number;
  /** Look-alike shapes on the ring beside the target. */
  distractors: number;
  /** Ring positions. */
  positions: number;
}

/**
 * The ramp is the exposure (500 → 100 ms, the floor binding exactly at the
 * ceiling 21) with distractors joining every fourth level — the shared
 * every-step-changes contract holds.
 */
export function splitSecondParams(level: number): SplitSecondParams {
  return {
    trials: 8,
    exposureMs: Math.max(100, 500 - (level - 1) * 20),
    maskMs: 300,
    distractors: Math.min(5, Math.floor((level - 1) / 4)),
    positions: 8,
  };
}

export interface SplitSecondTrial {
  /** Which of the two centre symbols (0 or 1). */
  centre: number;
  /** Ring position of the diamond, 0..positions-1. */
  target: number;
  /** Ring positions holding look-alike distractors; never the target's. */
  distractorAt: number[];
}

/**
 * Deterministic per rng. Centre symbols are balanced across the round
 * (forced half-and-half, shuffled) so symbol frequency carries no
 * information; target positions are uniform.
 */
export function generateSplitSecondTrials(rng: Rng, params: SplitSecondParams): SplitSecondTrial[] {
  const centres = shuffle(
    rng,
    Array.from({ length: params.trials }, (_, i) => i % 2),
  );
  return centres.map((centre) => {
    const target = randInt(rng, 0, params.positions - 1);
    const free = shuffle(
      rng,
      Array.from({ length: params.positions }, (_, p) => p).filter((p) => p !== target),
    );
    return { centre, target, distractorAt: free.slice(0, params.distractors) };
  });
}

export interface SplitSecondAnswer {
  centre: number | null;
  target: number | null;
}

export interface SplitSecondScore {
  /** Trials where both halves were right. */
  fullCatches: number;
  centreCorrect: number;
  targetCorrect: number;
  /** Mean of per-trial scores; each half of a trial is worth 0.5. */
  accuracy: number;
  perfect: boolean;
}

/**
 * Guessing pays poorly by construction: two symbols but eight positions,
 * so blind answers land near 0.31 — well under the adaptive band.
 */
export function scoreSplitSecond(
  trials: readonly SplitSecondTrial[],
  answers: readonly SplitSecondAnswer[],
): SplitSecondScore {
  let centreCorrect = 0;
  let targetCorrect = 0;
  let fullCatches = 0;
  trials.forEach((trial, i) => {
    const a = answers[i];
    const centreRight = a !== undefined && a.centre === trial.centre;
    const targetRight = a !== undefined && a.target === trial.target;
    if (centreRight) centreCorrect++;
    if (targetRight) targetCorrect++;
    if (centreRight && targetRight) fullCatches++;
  });
  const total = trials.length;
  return {
    fullCatches,
    centreCorrect,
    targetCorrect,
    accuracy: total === 0 ? 0 : (centreCorrect * 0.5 + targetCorrect * 0.5) / total,
    perfect: total > 0 && fullCatches === total,
  };
}
