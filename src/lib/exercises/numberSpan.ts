import { randInt, type Rng } from "@/lib/engine/rng";

/**
 * Number Span: memorise a digit sequence, reproduce it forwards or reversed.
 * Also powers Sound Span (auditory digits) with slower presentation timing.
 */

export type SpanDirection = "forward" | "reverse";

export interface NumberSpanParams {
  span: number;
  direction: SpanDirection;
  /** How long each digit is shown (or the gap between spoken digits). */
  digitMs: number;
  /** Gap between digits while presenting visually. */
  gapMs: number;
}

/**
 * Level mapping. Reverse recall is introduced from level 4 on alternating
 * rounds; reversed spans are one digit shorter (reverse is harder).
 *
 * Every level must change at least one parameter (the in-range cousin of
 * GAME-05's ceiling rule), and the parameter that changes must be one the
 * UI actually paces by. The span grows every OTHER level by design — that
 * pace is deliberate — so a timing carries the remaining ramp, with its
 * floor chosen to bind exactly at the level ceiling (39) so the ladder
 * ends where the contract test says it does. The VISUAL variant shows a
 * digit for digitMs then pauses gapMs, and the gap takes over once digitMs
 * bottoms out mid-range. The AUDITORY variant paces solely by digitMs (the
 * pause after each spoken digit or tone), so its whole ramp lives there at
 * a gentler slope — a ramp in a parameter the sound UI ignored would be a
 * level-up the user cannot hear.
 */
export function numberSpanParams(
  level: number,
  roundIndex: number,
  variant: "visual" | "auditory" = "visual",
): NumberSpanParams {
  const reverseUnlocked = level >= 4;
  const direction: SpanDirection = reverseUnlocked && roundIndex % 2 === 1 ? "reverse" : "forward";
  const baseSpan = 3 + Math.floor((level - 1) / 2);
  const span = Math.max(2, direction === "reverse" ? baseSpan - 1 : baseSpan);
  const digitMs =
    variant === "auditory"
      ? Math.max(582, 1000 - (level - 1) * 11)
      : Math.max(450, 900 - (level - 1) * 35);
  const gapMs = variant === "auditory" ? 150 : Math.max(96, 200 - Math.max(0, level - 13) * 4);
  return { span, direction, digitMs, gapMs };
}

/** Digits 0-9, avoiding immediate repeats so spoken digits stay distinct. */
export function generateDigits(rng: Rng, span: number): number[] {
  const digits: number[] = [];
  for (let i = 0; i < span; i++) {
    let d = randInt(rng, 0, 9);
    while (i > 0 && d === digits[i - 1]) d = randInt(rng, 0, 9);
    digits.push(d);
  }
  return digits;
}

/** The sequence the user must enter (already reversed for reverse recall). */
export function expectedAnswer(digits: number[], direction: SpanDirection): number[] {
  return direction === "reverse" ? [...digits].reverse() : [...digits];
}

export interface SpanScore {
  /** Longest correct prefix / span. */
  accuracy: number;
  perfect: boolean;
  correctPrefix: number;
}

export function scoreSpanResponse(expected: number[], response: number[]): SpanScore {
  let correctPrefix = 0;
  for (let i = 0; i < expected.length; i++) {
    if (response[i] === expected[i]) correctPrefix++;
    else break;
  }
  const accuracy = expected.length === 0 ? 0 : correctPrefix / expected.length;
  return { accuracy, perfect: correctPrefix === expected.length, correctPrefix };
}
