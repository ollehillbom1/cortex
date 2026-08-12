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
  /**
   * Fraction of non-matches deliberately placed as n±1 lures (a position
   * seen just beside the target distance). ABSENT — not 0 — below the
   * 4-back band: absence keeps levels up to the old ceiling byte-identical
   * to what measurement version 1 fingerprinted, which is what makes the
   * ladder extension additive instead of a measurement break.
   */
  lureRate?: number;
}

/**
 * Level mapping: 1-back for levels 1-3, 2-back for 4-9, 3-back for 10-18,
 * 4-back for 19-26, 5-back from 27. Within each N band the stream speeds up
 * and grows slightly; from the 4-back band, n±1 lures ramp as well, so
 * "felt familiar" stops being evidence of "was exactly n back". The lure
 * cap (0.44) binds exactly at the ceiling, like the timing floors: every
 * exposed step changes at least one parameter.
 */
export function nBackParams(level: number): NBackParams {
  const n = level < 4 ? 1 : level < 10 ? 2 : level < 19 ? 3 : level < 27 ? 4 : 5;
  const bandStart = n === 1 ? 1 : n === 2 ? 4 : n === 3 ? 10 : n === 4 ? 19 : 27;
  const withinBand = level - bandStart;
  return {
    n,
    trials: Math.min(26, 15 + n * 2 + withinBand),
    stimulusMs: Math.max(500, 700 - withinBand * 30),
    gapMs: Math.max(1200, 2000 - withinBand * 100),
    matchRate: 0.3,
    positions: 9,
    ...(n >= 4 ? { lureRate: Math.min(0.44, 0.2 + withinBand * 0.03) } : {}),
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
      stream.push({ position: nonMatchPosition(rng, stream, i, params), isMatch: false });
    }
  }
  return stream;
}

/**
 * A non-match position. With lureRate set, some non-matches copy the
 * position from n±1 steps back instead of being merely different-at-random:
 * rejecting them requires knowing WHERE in the stream a position occurred,
 * not just that it occurred recently. A lure that would coincide with the
 * position n back falls through to plain different-at-random — it must
 * never become an accidental match. When lureRate is absent this consumes
 * no extra randomness, so streams at pre-extension levels stay byte-equal
 * for a given seed.
 */
function nonMatchPosition(
  rng: Rng,
  stream: NBackTrialItem[],
  i: number,
  params: NBackParams,
): number {
  const { n, positions } = params;
  const prev = stream[i - n].position;
  const lureRate = params.lureRate ?? 0;
  if (lureRate > 0 && rng() < lureRate) {
    const useFar = rng() < 0.5 && i - (n + 1) >= 0;
    const offset = useFar ? n + 1 : n - 1;
    const candidate = offset >= 1 ? stream[i - offset].position : undefined;
    if (candidate !== undefined && candidate !== prev) return candidate;
  }
  let p = randInt(rng, 0, positions - 1);
  while (p === prev) p = randInt(rng, 0, positions - 1);
  return p;
}

export interface NBackScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** hits / (hits + misses), or null when the stream held no matches. */
  hitRate: number | null;
  /** correctRejections / (correctRejections + falseAlarms), or null when every trial matched. */
  specificity: number | null;
  /**
   * Balanced accuracy: (hitRate + specificity) / 2.
   *
   * Plain accuracy is wrong for this task. Only ~30% of trials are matches,
   * so never responding scores ~70% — inside the adaptive target band, which
   * levels a non-responder up for doing nothing. Balanced accuracy puts every
   * one-sided strategy at 0.5: never responding earns full specificity and
   * zero hit rate, always responding the reverse, and chance guessing lands
   * there too. Only genuine discrimination scores above the band.
   */
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
  const matches = hits + misses;
  const nonMatches = correctRejections + falseAlarms;
  const hitRate = matches === 0 ? null : hits / matches;
  const specificity = nonMatches === 0 ? null : correctRejections / nonMatches;

  // With one class absent the balanced average is undefined; score the class
  // that exists rather than inventing a value for the missing one.
  let accuracy: number;
  if (scoreable === 0) accuracy = 0;
  else if (hitRate === null) accuracy = specificity ?? 0;
  else if (specificity === null) accuracy = hitRate;
  else accuracy = (hitRate + specificity) / 2;

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    hitRate,
    specificity,
    accuracy,
    perfect: misses === 0 && falseAlarms === 0 && scoreable > 0,
  };
}
