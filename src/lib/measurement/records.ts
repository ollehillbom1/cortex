import type { PersonalRecord } from "@/lib/domain/types";

/**
 * The one rule for comparing personal records across measurement eras,
 * shared by session apply and by the cross-device profile merge — two call
 * sites with one semantics, or a not-yet-updated device would re-instate on
 * merge exactly what apply retired.
 *
 * Count records (span, beats, sequence, level) compare by value regardless
 * of era: nine digits are nine digits under any pacing. Millisecond records
 * are different. When the timing DEFINITION changes — reaction moved from
 * before-render to painted-frame in #51 — every old value is systematically
 * lower than an honest new one, so the old record becomes unbeatable for
 * being wrong, not for being good. Hence: an "Ms" record from a different
 * era never blocks one from the current era; the freshest era wins and the
 * clock restarts honestly.
 */
export function betterPersonalRecord(
  key: string,
  candidate: PersonalRecord,
  current: PersonalRecord | undefined,
): boolean {
  if (!current) return true;
  const lowerIsBetter = key.endsWith("Ms");
  if (lowerIsBetter && (candidate.measurementVersion ?? 0) !== (current.measurementVersion ?? 0)) {
    // Different timing definitions are different clocks: the newer era
    // wins outright, in either direction of the version comparison — a
    // device rolled back mid-household should not resurrect the old clock.
    return (candidate.measurementVersion ?? 0) > (current.measurementVersion ?? 0);
  }
  return lowerIsBetter ? candidate.value < current.value : candidate.value > current.value;
}
