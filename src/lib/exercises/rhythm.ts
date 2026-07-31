import { pick, type Rng } from "@/lib/engine/rng";

/**
 * Rhythm Recall: listen to a rhythm, tap it back. Scoring compares
 * inter-onset intervals with a tolerance window, after normalising overall
 * tempo, so the *pattern* matters more than absolute speed (issue #4).
 */

export interface RhythmParams {
  /** Number of taps (intervals = beats - 1). */
  beats: number;
  /** Base time unit in ms. */
  unitMs: number;
  /** Interval tolerance as a fraction of the expected interval. */
  tolerance: number;
}

export function rhythmParams(level: number): RhythmParams {
  return {
    beats: Math.min(9, 3 + Math.floor(level / 2)),
    unitMs: Math.max(260, 380 - (level - 1) * 6),
    tolerance: Math.max(0.16, 0.3 - (level - 1) * 0.01),
  };
}

/** Multiples of the base unit that intervals are built from. */
const INTERVAL_STEPS = [1, 1.5, 2];

/** Inter-onset intervals in ms (length = beats - 1). */
export function generateRhythm(rng: Rng, params: RhythmParams): number[] {
  const intervals: number[] = [];
  for (let i = 0; i < params.beats - 1; i++) {
    intervals.push(Math.round(pick(rng, INTERVAL_STEPS) * params.unitMs));
  }
  return intervals;
}

/** Onset times in ms from the first beat at t=0. */
export function onsetsFromIntervals(intervals: number[]): number[] {
  const onsets = [0];
  for (const interval of intervals) onsets.push(onsets[onsets.length - 1] + interval);
  return onsets;
}

export interface RhythmScore {
  accuracy: number;
  perfect: boolean;
  matchedIntervals: number;
  /** Tempo scale applied to the response before comparison. */
  tempoScale: number;
}

/**
 * Score tapped onsets against the expected intervals.
 *
 * The response's intervals are scaled by a single global factor (clamped to
 * [0.6, 1.66]) so playing the whole rhythm somewhat faster or slower is not
 * punished — only the pattern is. An interval matches when it lands within
 * `tolerance x expected`. Missing or extra taps subtract from accuracy.
 */
export function scoreRhythm(
  expectedIntervals: number[],
  tappedOnsetsMs: number[],
  tolerance: number,
): RhythmScore {
  const expectedBeats = expectedIntervals.length + 1;
  if (tappedOnsetsMs.length < 2 || expectedIntervals.length === 0) {
    return { accuracy: 0, perfect: false, matchedIntervals: 0, tempoScale: 1 };
  }

  const actualIntervals: number[] = [];
  for (let i = 1; i < tappedOnsetsMs.length; i++) {
    actualIntervals.push(tappedOnsetsMs[i] - tappedOnsetsMs[i - 1]);
  }

  const comparable = Math.min(actualIntervals.length, expectedIntervals.length);
  const expectedSum = expectedIntervals.slice(0, comparable).reduce((a, b) => a + b, 0);
  const actualSum = actualIntervals.slice(0, comparable).reduce((a, b) => a + b, 0);
  const tempoScale = actualSum <= 0 ? 1 : Math.min(1.66, Math.max(0.6, expectedSum / actualSum));

  let matched = 0;
  for (let i = 0; i < comparable; i++) {
    const scaled = actualIntervals[i] * tempoScale;
    if (Math.abs(scaled - expectedIntervals[i]) <= tolerance * expectedIntervals[i]) {
      matched++;
    }
  }

  const beatCountPenalty = Math.abs(tappedOnsetsMs.length - expectedBeats);
  const accuracy = Math.max(0, (matched - beatCountPenalty * 0.5) / expectedIntervals.length);
  return {
    accuracy,
    perfect: matched === expectedIntervals.length && beatCountPenalty === 0,
    matchedIntervals: matched,
    tempoScale,
  };
}
