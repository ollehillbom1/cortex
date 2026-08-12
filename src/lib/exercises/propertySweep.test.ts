import { describe, expect, it } from "vitest";
import { createRng, randInt, type Rng } from "@/lib/engine/rng";
import { EXERCISES } from "@/lib/domain/types";
import { MIN_LEVEL, initialSkill, updateSkill } from "@/lib/adaptive/engine";
import { expectedAnswer, generateDigits, numberSpanParams, scoreSpanResponse } from "./numberSpan";
import { generateSequence, scoreSequenceResponse, sequenceParams } from "./sequenceMemory";
import { generatePattern, patternParams, scorePatternResponse } from "./visualPattern";
import { generateNBackStream, nBackParams, scoreNBack } from "./nback";
import { dualNBackParams, generateDualNBackStream, scoreDualNBack } from "./dualNBack";
import { generateMelody, scoreMelodyResponse, tonePatternParams } from "./tonePattern";
import { generateRhythm, onsetsFromIntervals, rhythmParams, scoreRhythm } from "./rhythm";
import { generateDelay, reactionParams, scoreReaction } from "./reaction";
import { generateGoNoGoTrials, goNoGoParams, scoreGoNoGo } from "./goNoGo";
import {
  generateNameRecallRound,
  NAME_LISTS,
  nameRecallParams,
  scoreNameRecall,
} from "./nameRecall";
import { generateSplitSecondTrials, scoreSplitSecond, splitSecondParams } from "./splitSecond";

/**
 * Property sweep: every exercise, every exposed level, a spread of seeds.
 *
 * The single-case tests elsewhere pin behaviours someone thought of. This
 * file pins the behaviours nobody thinks of: a generator that goes invalid
 * only at level 23 with the wrong seed, a score that leaves [0,1] on a
 * malformed response, a determinism break. Everything here is a pure
 * function of (level, seed), so the whole space is sweepable in seconds.
 *
 * Plain-throw invariants instead of one expect() per check: the loop body
 * runs six figures of assertions, and the failure message carries the
 * (exercise, level, seed) needed to reproduce.
 */

const SEEDS = Array.from({ length: 20 }, (_, i) => i * 37 + 1);

function invariant(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function inUnit(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

/** A plausible-garbage response: right type, random content. */
function randomDigits(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => randInt(rng, 0, 9));
}

describe("property sweep across all levels and seeds", () => {
  it("number span (visual + auditory): generation and scoring hold everywhere", () => {
    for (const variant of ["visual", "auditory"] as const) {
      const cap = EXERCISES[variant === "visual" ? "number-span" : "auditory-digits"].maxLevel;
      for (let level = 1; level <= cap; level++) {
        for (const round of [0, 1]) {
          const p = numberSpanParams(level, round, variant);
          invariant(p.span >= 2 && p.digitMs > 0 && p.gapMs >= 0, `params ${variant} L${level}`);
          for (const seed of SEEDS) {
            const ctx = `number-span/${variant} L${level} r${round} seed ${seed}`;
            const digits = generateDigits(createRng(seed), p.span);
            invariant(digits.length === p.span, `${ctx}: span`);
            invariant(
              digits.every((d, i) => d >= 0 && d <= 9 && (i === 0 || d !== digits[i - 1])),
              `${ctx}: digit validity`,
            );
            invariant(
              JSON.stringify(generateDigits(createRng(seed), p.span)) === JSON.stringify(digits),
              `${ctx}: determinism`,
            );
            const expected = expectedAnswer(digits, p.direction);
            invariant(scoreSpanResponse(expected, expected).perfect, `${ctx}: perfect`);
            invariant(scoreSpanResponse(expected, []).accuracy === 0, `${ctx}: empty`);
            const noise = scoreSpanResponse(expected, randomDigits(createRng(seed + 1), p.span));
            invariant(inUnit(noise.accuracy), `${ctx}: noise accuracy ${noise.accuracy}`);
          }
        }
      }
    }
    expect(true).toBe(true);
  });

  it("sequence memory: sequences stay on the grid and scoring is bounded", () => {
    const cap = EXERCISES["sequence-memory"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = sequenceParams(level);
      const cells = p.gridSize * p.gridSize;
      for (const seed of SEEDS) {
        const ctx = `sequence-memory L${level} seed ${seed}`;
        const seq = generateSequence(createRng(seed), p);
        invariant(seq.length === p.length, `${ctx}: length`);
        invariant(
          seq.every((c, i) => c >= 0 && c < cells && (i === 0 || c !== seq[i - 1])),
          `${ctx}: cell validity`,
        );
        invariant(scoreSequenceResponse(seq, seq).perfect, `${ctx}: perfect`);
        invariant(scoreSequenceResponse(seq, []).accuracy === 0, `${ctx}: empty`);
        const noise = seq.map(() => randInt(createRng(seed + 1), 0, cells - 1));
        invariant(inUnit(scoreSequenceResponse(seq, noise).accuracy), `${ctx}: noise`);
      }
    }
    expect(true).toBe(true);
  });

  it("pattern recall: patterns are distinct, never near-full, scoring bounded", () => {
    const cap = EXERCISES["visual-pattern"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = patternParams(level);
      const cells = p.gridSize * p.gridSize;
      invariant(p.activeCells <= cells - 2, `pattern L${level}: near-full grid`);
      for (const seed of SEEDS) {
        const ctx = `visual-pattern L${level} seed ${seed}`;
        const pattern = generatePattern(createRng(seed), p);
        invariant(new Set(pattern).size === p.activeCells, `${ctx}: distinct`);
        invariant(
          pattern.every((c) => c >= 0 && c < cells),
          `${ctx}: on grid`,
        );
        invariant(scorePatternResponse(pattern, pattern).perfect, `${ctx}: perfect`);
        invariant(scorePatternResponse(pattern, []).accuracy === 0, `${ctx}: empty`);
        const everything = Array.from({ length: cells }, (_, i) => i);
        const grab = scorePatternResponse(pattern, everything);
        invariant(inUnit(grab.accuracy) && !grab.perfect, `${ctx}: tap-everything`);
      }
    }
    expect(true).toBe(true);
  });

  it("n-back and dual n-back: stream structure and balanced scoring hold at every level", () => {
    function checkStream(
      stream: ReturnType<typeof generateNBackStream>,
      p: { n: number; trials: number; matchRate: number },
      ctx: string,
    ) {
      invariant(stream.length === p.trials, `${ctx}: trials`);
      const matches = stream.filter((s) => s.isMatch).length;
      const scoreable = p.trials - p.n;
      invariant(
        matches === Math.max(1, Math.round(scoreable * p.matchRate)),
        `${ctx}: forced match count`,
      );
      for (let i = p.n; i < stream.length; i++) {
        invariant(
          (stream[i].position === stream[i - p.n].position) === stream[i].isMatch,
          `${ctx}: match flag truth at ${i}`,
        );
      }
      const perfect = scoreNBack(
        stream,
        stream.map((s) => s.isMatch),
        p.n,
      );
      invariant(perfect.perfect && perfect.accuracy === 1, `${ctx}: perfect`);
      for (const constant of [true, false]) {
        const oneSided = scoreNBack(
          stream,
          stream.map(() => constant),
          p.n,
        );
        invariant(
          inUnit(oneSided.accuracy) && oneSided.accuracy <= 0.5 + 1e-9,
          `${ctx}: one-sided ${constant} scored ${oneSided.accuracy}`,
        );
      }
    }

    for (let level = 1; level <= EXERCISES["n-back"].maxLevel; level++) {
      const p = nBackParams(level);
      for (const seed of SEEDS) {
        checkStream(generateNBackStream(createRng(seed), p), p, `n-back L${level} seed ${seed}`);
      }
    }
    for (let level = 1; level <= EXERCISES["dual-n-back"].maxLevel; level++) {
      const p = dualNBackParams(level);
      for (const seed of SEEDS) {
        const s = generateDualNBackStream(createRng(seed), p);
        checkStream(s.position, p, `dual-n-back/position L${level} seed ${seed}`);
        checkStream(
          s.sound,
          { ...p, trials: p.trials },
          `dual-n-back/sound L${level} seed ${seed}`,
        );
      }
    }
    // Dual scoring composes the two channels; bound it too.
    const p = dualNBackParams(21);
    const s = generateDualNBackStream(createRng(7), p);
    const score = scoreDualNBack(
      s,
      s.position.map((t) => t.isMatch),
      s.sound.map(() => false),
      p.n,
    );
    expect(score.accuracy).toBeGreaterThanOrEqual(0);
    expect(score.accuracy).toBeLessThanOrEqual(1);
  });

  it("tone pattern: melodies fit the pads, scoring bounded", () => {
    const cap = EXERCISES["tone-pattern"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = tonePatternParams(level);
      for (const seed of SEEDS) {
        const ctx = `tone-pattern L${level} seed ${seed}`;
        const melody = generateMelody(createRng(seed), p);
        invariant(melody.length === p.length, `${ctx}: length`);
        invariant(
          melody.every((n) => n >= 0 && n < p.pads),
          `${ctx}: pads`,
        );
        invariant(scoreMelodyResponse(melody, melody).perfect, `${ctx}: perfect`);
        invariant(scoreMelodyResponse(melody, []).accuracy === 0, `${ctx}: empty`);
        const noise = melody.map(() => randInt(createRng(seed + 1), 0, p.pads - 1));
        invariant(inUnit(scoreMelodyResponse(melody, noise).accuracy), `${ctx}: noise`);
      }
    }
    expect(true).toBe(true);
  });

  it("rhythm: intervals are positive, exact and tempo-shifted taps stay perfect, noise bounded", () => {
    const cap = EXERCISES["rhythm-recall"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = rhythmParams(level);
      for (const seed of SEEDS) {
        const ctx = `rhythm L${level} seed ${seed}`;
        const intervals = generateRhythm(createRng(seed), p);
        invariant(intervals.length === p.beats - 1, `${ctx}: interval count`);
        invariant(
          intervals.every((v) => v > 0 && Number.isFinite(v)),
          `${ctx}: positive intervals`,
        );
        const onsets = onsetsFromIntervals(intervals);
        invariant(
          onsets.every((v, i) => i === 0 || v > onsets[i - 1]),
          `${ctx}: monotone onsets`,
        );
        invariant(scoreRhythm(intervals, onsets, p.tolerance).perfect, `${ctx}: exact taps`);
        // A uniformly faster/slower performance is the SAME rhythm: tempo
        // normalisation must keep it perfect (within the scale clamp).
        const shifted = onsets.map((v) => v * 1.15);
        invariant(
          scoreRhythm(intervals, shifted, p.tolerance).perfect,
          `${ctx}: tempo-shifted taps`,
        );
        const noiseRng = createRng(seed + 1);
        const noise = onsets.map((v) => v + randInt(noiseRng, -400, 400)).sort((a, b) => a - b);
        invariant(inUnit(scoreRhythm(intervals, noise, p.tolerance).accuracy), `${ctx}: noise`);
      }
    }
    expect(true).toBe(true);
  });

  it("reaction: delays live in their window, mixed rounds score in bounds", () => {
    const p = reactionParams();
    for (const seed of SEEDS) {
      const rng = createRng(seed);
      for (let i = 0; i < 40; i++) {
        const d = generateDelay(rng, p);
        invariant(
          d >= p.minDelayMs && d <= p.maxDelayMs,
          `reaction seed ${seed}: delay ${d} outside window`,
        );
      }
      const mixRng = createRng(seed + 1);
      const rounds = Array.from({ length: 5 }, () =>
        mixRng() < 0.3
          ? ({ kind: "false-start" } as const)
          : ({ kind: "ok", ms: randInt(mixRng, 130, 900) } as const),
      );
      const score = scoreReaction(rounds);
      invariant(inUnit(score.accuracy), `reaction seed ${seed}: accuracy ${score.accuracy}`);
    }
    expect(true).toBe(true);
  });

  it("go/no-go: composition holds at every level, scoring bounded for any answer shape", () => {
    const cap = EXERCISES["go-no-go"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = goNoGoParams(level);
      for (const seed of SEEDS) {
        const ctx = `go-no-go L${level} seed ${seed}`;
        const trials = generateGoNoGoTrials(createRng(seed), p);
        invariant(trials.length === p.trials && trials[0].go, `${ctx}: composition`);
        invariant(
          trials.filter((t) => !t.go).length === Math.max(1, Math.round(p.trials * p.noGoRate)),
          `${ctx}: no-go count`,
        );
        invariant(
          trials.every((t) => t.isiMs >= p.isiMs && t.isiMs <= p.isiMs + p.isiJitterMs),
          `${ctx}: jitter window`,
        );
        const noiseRng = createRng(seed + 1);
        const noise = trials.map(() => (noiseRng() < 0.5 ? randInt(noiseRng, 100, 800) : null));
        invariant(inUnit(scoreGoNoGo(trials, noise).accuracy), `${ctx}: noise`);
      }
    }
    expect(true).toBe(true);
  });

  it("name recall: rounds stay valid at every level for both locales", () => {
    const cap = EXERCISES["name-recall"].maxLevel;
    for (const locale of ["en", "sv"] as const) {
      const names = NAME_LISTS[locale];
      for (let level = 1; level <= cap; level++) {
        const p = nameRecallParams(level);
        for (const seed of SEEDS) {
          const ctx = `name-recall/${locale} L${level} seed ${seed}`;
          const round = generateNameRecallRound(createRng(seed), p, names);
          invariant(round.pairs.length === p.pairs, `${ctx}: pairs`);
          invariant(
            new Set(round.pairs.map((x) => x.name)).size === p.pairs,
            `${ctx}: unique names`,
          );
          invariant(
            [...round.quiz.map((q) => q.pairIndex)].sort((a, b) => a - b).join() ===
              round.pairs.map((_, i) => i).join(),
            `${ctx}: quiz permutation`,
          );
          for (const q of round.quiz) {
            invariant(
              q.options.length === p.options && new Set(q.options).size === p.options,
              `${ctx}: option count`,
            );
            invariant(
              q.options.filter((o) => o === round.pairs[q.pairIndex].name).length === 1,
              `${ctx}: exactly one correct option`,
            );
          }
          const allRight = round.quiz.map((q) => round.pairs[q.pairIndex].name);
          invariant(scoreNameRecall(round, allRight).perfect, `${ctx}: perfect`);
          invariant(
            inUnit(
              scoreNameRecall(
                round,
                round.quiz.map((q) => q.options[0]),
              ).accuracy,
            ),
            `${ctx}: first-option strategy bounded`,
          );
        }
      }
    }
    expect(true).toBe(true);
  });

  it("split second: trials stay valid at every level, scoring bounded", () => {
    const cap = EXERCISES["split-second"].maxLevel;
    for (let level = 1; level <= cap; level++) {
      const p = splitSecondParams(level);
      for (const seed of SEEDS) {
        const ctx = `split-second L${level} seed ${seed}`;
        const trials = generateSplitSecondTrials(createRng(seed), p);
        invariant(trials.length === p.trials, `${ctx}: trials`);
        for (const t of trials) {
          invariant(t.centre === 0 || t.centre === 1, `${ctx}: centre`);
          invariant(t.target >= 0 && t.target < p.positions, `${ctx}: target`);
          invariant(
            t.distractorAt.length === p.distractors &&
              !t.distractorAt.includes(t.target) &&
              new Set(t.distractorAt).size === t.distractorAt.length,
            `${ctx}: distractors`,
          );
        }
        const noiseRng = createRng(seed + 1);
        const noise = trials.map(() => ({
          centre: noiseRng() < 0.2 ? null : randInt(noiseRng, 0, 1),
          target: noiseRng() < 0.2 ? null : randInt(noiseRng, 0, p.positions - 1),
        }));
        invariant(inUnit(scoreSplitSecond(trials, noise).accuracy), `${ctx}: noise`);
      }
    }
    expect(true).toBe(true);
  });

  it("adaptive engine: no input sequence produces NaN or leaves the level range", () => {
    for (const id of Object.keys(EXERCISES) as (keyof typeof EXERCISES)[]) {
      const maxLevel = EXERCISES[id].maxLevel;
      for (const seed of SEEDS) {
        const rng = createRng(seed);
        for (const gentle of [false, true]) {
          let skill = initialSkill();
          for (let round = 0; round < 60; round++) {
            skill = updateSkill(
              skill,
              {
                accuracy: rng(),
                fatigue: rng(),
                inputMs: rng() < 0.3 ? undefined : randInt(rng, 1, 30_000),
                responseUnits: rng() < 0.5 ? undefined : randInt(rng, 1, 12),
              },
              new Date(2026, 0, 1 + round),
              { gentle, maxLevel },
            );
            invariant(
              Number.isFinite(skill.level) && skill.level >= MIN_LEVEL && skill.level <= maxLevel,
              `engine ${id} seed ${seed} round ${round}: level ${skill.level}`,
            );
            invariant(
              skill.recent.length <= 10 && skill.recentInputMs.length <= 10,
              `engine ${id} seed ${seed} round ${round}: buffer overflow`,
            );
          }
        }
      }
    }
    expect(true).toBe(true);
  });
});
