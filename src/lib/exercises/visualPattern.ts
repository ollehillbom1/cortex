import { shuffle, type Rng } from "@/lib/engine/rng";

/**
 * Visual Pattern Recall: a set of grid cells flashes briefly; the user
 * reconstructs the pattern from memory.
 */

export interface PatternParams {
  gridSize: number;
  activeCells: number;
  showMs: number;
}

export function patternParams(level: number): PatternParams {
  const gridSize = level < 5 ? 3 : level < 11 ? 4 : 5;
  const cells = gridSize * gridSize;
  const activeCells = Math.min(cells - 2, 3 + Math.floor((level - 1) * 0.7));
  // showMs bottomed out at level 20 while activeCells only moves on 7 of 10
  // levels, leaving dead steps in the low twenties. Past 20 the show time
  // keeps shrinking at a gentler slope, with a floor that binds exactly at
  // the ceiling (30): every exposed step changes something.
  const showMs =
    level <= 20 ? Math.max(900, 2200 - (level - 1) * 70) : Math.max(750, 900 - (level - 20) * 15);
  return { gridSize, activeCells, showMs };
}

/** Distinct cell indices forming the pattern. */
export function generatePattern(rng: Rng, params: PatternParams): number[] {
  const cells = params.gridSize * params.gridSize;
  const all = Array.from({ length: cells }, (_, i) => i);
  return shuffle(rng, all)
    .slice(0, params.activeCells)
    .sort((a, b) => a - b);
}

export interface PatternScore {
  accuracy: number;
  perfect: boolean;
  hits: number;
  misses: number;
  extras: number;
}

/**
 * accuracy = (hits - extras) / target, floored at 0, so tapping everything
 * cannot game the score.
 */
export function scorePatternResponse(expected: number[], selected: number[]): PatternScore {
  const expectedSet = new Set(expected);
  const selectedSet = new Set(selected);
  let hits = 0;
  let extras = 0;
  for (const cell of selectedSet) {
    if (expectedSet.has(cell)) hits++;
    else extras++;
  }
  const misses = expected.length - hits;
  const accuracy = expected.length === 0 ? 0 : Math.max(0, (hits - extras) / expected.length);
  return { accuracy, perfect: hits === expected.length && extras === 0, hits, misses, extras };
}
