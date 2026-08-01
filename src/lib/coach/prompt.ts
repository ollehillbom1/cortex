import { translate } from "@/lib/i18n";
import { renderFact, type CoachLocale, type InsightFact } from "./protocol";

/**
 * Prompt construction for the optional coach (issue #11, phase 2).
 *
 * Built entirely on the server from validated facts, so the browser cannot
 * contribute prompt text and there is no injection surface reachable from the
 * app. Sources are rendered in the *target* locale, which is also what makes
 * the output guardrails work for Swedish: the model rephrases a Swedish
 * sentence, so its words can be checked against Swedish source words.
 */

const LANGUAGE_NAMES: Record<CoachLocale, string> = {
  en: "English",
  sv: "Swedish",
};

export const SYSTEM_PROMPT = [
  "You rewrite short training observations for a cognitive-training app.",
  "",
  "Rules, in order of importance:",
  "1. Rephrase ONLY what each observation states. Never add facts, numbers, percentages, comparisons or explanations that are not in the input.",
  "2. Never make claims about health, intelligence, IQ, memory capacity, brain function, medical conditions, diagnosis or treatment. These observations describe results inside a practice app and nothing more.",
  "3. Never promise improvement or transfer to everyday life.",
  "4. Keep every number exactly as it appears, attached to the same thing it describes.",
  "5. Keep the same number of lines as the input, in the same order: exactly one rewritten line per input line.",
  "6. Stay close to the original wording and length — this is a rewrite, not an expansion. No lists, no headings, no preamble, no closing remarks.",
  "7. Output the rewritten lines only, one per line.",
].join("\n");

export interface CoachMessage {
  role: "system" | "user";
  content: string;
}

/** The deterministic sentences, in the locale the model will answer in. */
export function sourceLines(facts: InsightFact[], locale: CoachLocale): string[] {
  return facts.map((fact) => renderFact(fact, (text, vars) => translate(locale, text, vars)));
}

export function buildMessages(facts: InsightFact[], locale: CoachLocale): CoachMessage[] {
  const sources = sourceLines(facts, locale);
  const user = [
    `Rewrite these ${sources.length} observation(s) in ${LANGUAGE_NAMES[locale]}.`,
    "",
    ...sources,
  ].join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
