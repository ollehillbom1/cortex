import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Go/No-Go: a stream of stimuli where most are "go" (respond fast) and some
 * are "no-go" (withhold). The exercise measures response inhibition — the
 * first task in the app where NOT acting is the skill being trained.
 *
 * Scoring is balanced, like n-back's: with ~75% go trials, plain accuracy
 * would pay an always-presser ~75% — inside the adaptive band — so every
 * one-sided strategy must land at 0.5 and only genuine discrimination may
 * score above it.
 */

export interface GoNoGoParams {
  /** Total stimuli in the round. */
  trials: number;
  /** Fraction of trials that are no-go. */
  noGoRate: number;
  /** Response window from stimulus onset; a press after it is a miss. */
  deadlineMs: number;
  /** Blank between trials (fixed part). */
  isiMs: number;
  /** Random extra ISI so onsets cannot be timed by rhythm. */
  isiJitterMs: number;
}

/**
 * One ramp, four moving parts: the window tightens, the blanks shrink, the
 * stream grows and no-gos get more common. The deadline and ISI floors bind
 * exactly at the ceiling (25), so every exposed step changes at least one
 * parameter — the same contract the other ladders keep.
 */
export function goNoGoParams(level: number): GoNoGoParams {
  return {
    trials: Math.min(30, 20 + Math.floor((level - 1) / 2)),
    noGoRate: Math.min(0.35, 0.2 + (level - 1) * 0.01),
    deadlineMs: Math.max(550, 900 - (level - 1) * 15),
    isiMs: Math.max(800, 1400 - (level - 1) * 25),
    isiJitterMs: 400,
  };
}

export interface GoNoGoTrialItem {
  go: boolean;
  /** ISI before this trial's onset, jitter included (deterministic per seed). */
  isiMs: number;
}

/**
 * Forced composition, like the n-back generator: the no-go count is exact,
 * not expected — a round can never come out all-go by luck. No-go positions
 * are drawn without replacement; never the first trial, so the round always
 * opens by establishing the prepotent go response the no-gos then test.
 */
export function generateGoNoGoTrials(rng: Rng, params: GoNoGoParams): GoNoGoTrialItem[] {
  const noGoTarget = Math.max(1, Math.round(params.trials * params.noGoRate));
  const noGoAt = new Set<number>();
  const candidates = Array.from({ length: params.trials - 1 }, (_, i) => i + 1);
  while (noGoAt.size < noGoTarget && candidates.length > 0) {
    const idx = randInt(rng, 0, candidates.length - 1);
    noGoAt.add(candidates[idx]);
    candidates.splice(idx, 1);
  }
  return Array.from({ length: params.trials }, (_, i) => ({
    go: !noGoAt.has(i),
    isiMs: params.isiMs + randInt(rng, 0, params.isiJitterMs),
  }));
}

export interface GoNoGoScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  /** hits / go trials, or null when the round had none. */
  goRate: number | null;
  /** correct rejections / no-go trials, or null when the round had none. */
  withholdRate: number | null;
  /** Balanced accuracy: every one-sided strategy lands at 0.5. */
  accuracy: number;
  perfect: boolean;
  /** Mean reaction time over hits, or null with no hits. */
  meanGoMs: number | null;
}

/**
 * `responses[i]` is the reaction time of a press inside trial i's response
 * window, or null when the trial was left alone. The component owns the
 * window: a press after the deadline lands in no trial and arrives here as
 * null — too slow to a go trial IS a miss, exactly like not pressing.
 */
export function scoreGoNoGo(
  trials: readonly GoNoGoTrialItem[],
  responses: readonly (number | null)[],
): GoNoGoScore {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;
  const goTimes: number[] = [];
  trials.forEach((trial, i) => {
    const pressed = responses[i] !== null && responses[i] !== undefined;
    if (trial.go) {
      if (pressed) {
        hits++;
        goTimes.push(responses[i] as number);
      } else misses++;
    } else {
      if (pressed) falseAlarms++;
      else correctRejections++;
    }
  });

  const goTrials = hits + misses;
  const noGoTrials = falseAlarms + correctRejections;
  const goRate = goTrials === 0 ? null : hits / goTrials;
  const withholdRate = noGoTrials === 0 ? null : correctRejections / noGoTrials;

  // With one class absent the balanced average is undefined; score the class
  // that exists rather than inventing a value for the missing one.
  let accuracy: number;
  if (trials.length === 0) accuracy = 0;
  else if (goRate === null) accuracy = withholdRate ?? 0;
  else if (withholdRate === null) accuracy = goRate;
  else accuracy = (goRate + withholdRate) / 2;

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    goRate,
    withholdRate,
    accuracy,
    perfect: misses === 0 && falseAlarms === 0 && trials.length > 0,
    meanGoMs:
      goTimes.length > 0 ? Math.round(goTimes.reduce((a, b) => a + b, 0) / goTimes.length) : null,
  };
}
