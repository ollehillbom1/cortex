import type { Rng } from "@/lib/engine/rng";
import {
  generateNBackStream,
  scoreNBack,
  type NBackScore,
  type NBackTrialItem,
} from "@/lib/exercises/nback";

/**
 * Dual N-Back (issue #3): a position stream and a sound stream run
 * simultaneously; each channel is matched independently against the item N
 * steps back. Reuses the single n-back generator per channel.
 */

export interface DualNBackParams {
  n: number;
  trials: number;
  stimulusMs: number;
  /** Gap between stimuli; slower than single n-back due to the dual load. */
  gapMs: number;
  matchRate: number;
  positions: number;
  /** Number of distinct sounds (spoken letters or tones). */
  sounds: number;
}

/** Classic dual n-back letter set — phonetically distinct when spoken. */
export const DUAL_NBACK_LETTERS = ["C", "H", "K", "L", "Q", "R", "S", "T"];

export function dualNBackParams(level: number): DualNBackParams {
  const n = level < 5 ? 1 : level < 12 ? 2 : 3;
  const bandStart = n === 1 ? 1 : n === 2 ? 5 : 12;
  const withinBand = level - bandStart;
  return {
    n,
    trials: Math.min(24, 14 + n * 2 + withinBand),
    stimulusMs: 700,
    gapMs: Math.max(1600, 2400 - withinBand * 100),
    matchRate: 0.25,
    positions: 9,
    sounds: DUAL_NBACK_LETTERS.length,
  };
}

export interface DualNBackStream {
  position: NBackTrialItem[];
  sound: NBackTrialItem[];
}

/** Two independent streams with the same forced match structure. */
export function generateDualNBackStream(rng: Rng, params: DualNBackParams): DualNBackStream {
  const base = {
    n: params.n,
    trials: params.trials,
    stimulusMs: params.stimulusMs,
    gapMs: params.gapMs,
    matchRate: params.matchRate,
  };
  return {
    position: generateNBackStream(rng, { ...base, positions: params.positions }),
    sound: generateNBackStream(rng, { ...base, positions: params.sounds }),
  };
}

export interface DualNBackScore {
  position: NBackScore;
  sound: NBackScore;
  /** Mean of the two channel accuracies — what the adaptive engine sees. */
  accuracy: number;
  perfect: boolean;
}

export function scoreDualNBack(
  stream: DualNBackStream,
  positionResponses: boolean[],
  soundResponses: boolean[],
  n: number,
): DualNBackScore {
  const position = scoreNBack(stream.position, positionResponses, n);
  const sound = scoreNBack(stream.sound, soundResponses, n);
  return {
    position,
    sound,
    accuracy: (position.accuracy + sound.accuracy) / 2,
    perfect: position.perfect && sound.perfect,
  };
}

/**
 * Single n-back level required before the planner recommends dual n-back
 * (2-back unlocks at single n-back level 4).
 */
export const DUAL_NBACK_GATE_LEVEL = 4;
