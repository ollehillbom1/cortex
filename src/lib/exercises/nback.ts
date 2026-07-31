import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Visual position N-Back: a square appears in one of 9 positions; the user
 * responds when the position matches the one N steps earlier.
 */

export interface NBackParams {
  n: number;
  /** Total stimuli in the stream (scored trials = trials - n). */
  trials: number;
  /** Time each stimulus is visible. */
  stimulusMs: number;
  /** Gap between stimuli (response window spans stimulus + gap). */
  gapMs: number;
  /** Fraction of scoreable trials that are matches. */
  matchRate: number;
  positions: number;
}

/**
 * Level mapping: 1-back for levels 1-3, 2-back for 4-9, 3-back from 10.
 * Within each N band the stream speeds up and grows slightly.
 */
export function nBackParams(level: number): NBackParams {
  const n = level < 4 ? 1 : level < 10 ? 2 : 3;
  const bandStart = n === 1 ? 1 : n === 2 ? 4 : 10;
  const withinBand = level - bandStart;
  return {
    n,
    trials: Math.min(26, 15 + n * 2 + withinBand),
    stimulusMs: Math.max(500, 700 - withinBand * 30),
    gapMs: Math.max(1200, 2000 - withinBand * 100),
    matchRate: 0.3,
    positions: 9,
  };
}

export interface NBackTrialItem {
  position: number;
  /** Whether this item matches the item n steps earlier. */
  isMatch: boolean;
}

/**
 * Build a stream with a controlled number of matches. Matches are forced by
 * copying the position from n steps back; non-matches are forced different.
 */
export function generateNBackStream(rng: Rng, params: NBackParams): NBackTrialItem[] {
  const { n, trials, matchRate, positions } = params;
  const scoreable = trials - n;
  const matchTarget = Math.max(1, Math.round(scoreable * matchRate));

  // Choose which scoreable indices (n..trials-1) are matches.
  const matchAt = new Set<number>();
  const candidates = Array.from({ length: scoreable }, (_, i) => i + n);
  while (matchAt.size < matchTarget && candidates.length > 0) {
    const idx = randInt(rng, 0, candidates.length - 1);
    matchAt.add(candidates[idx]);
    candidates.splice(idx, 1);
  }

  const stream: NBackTrialItem[] = [];
  for (let i = 0; i < trials; i++) {
    if (i < n) {
      stream.push({ position: randInt(rng, 0, positions - 1), isMatch: false });
      continue;
    }
    const prev = stream[i - n].position;
    if (matchAt.has(i)) {
      stream.push({ position: prev, isMatch: true });
    } else {
      let p = randInt(rng, 0, positions - 1);
      while (p === prev) p = randInt(rng, 0, positions - 1);
      stream.push({ position: p, isMatch: false });
    }
  }
  return stream;
}

export interface NBackScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** (hits + correctRejections) / scoreable trials. */
  accuracy: number;
  perfect: boolean;
}

/**
 * `responses[i]` is true when the user signalled "match" for stream item i.
 * Items before index n are ignored (nothing to compare against).
 */
export function scoreNBack(stream: NBackTrialItem[], responses: boolean[], n: number): NBackScore {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;
  for (let i = n; i < stream.length; i++) {
    const responded = responses[i] === true;
    if (stream[i].isMatch) {
      if (responded) hits++;
      else misses++;
    } else {
      if (responded) falseAlarms++;
      else correctRejections++;
    }
  }
  const scoreable = stream.length - n;
  const accuracy = scoreable === 0 ? 0 : (hits + correctRejections) / scoreable;
  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    accuracy,
    perfect: misses === 0 && falseAlarms === 0 && scoreable > 0,
  };
}
