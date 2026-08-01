import { renderFactEnglish, type CoachLocale, type InsightFact } from "./protocol";

/**
 * Prompt construction for the optional coach (issue #11, phase 2).
 *
 * Built entirely on the server from validated facts. The browser cannot
 * contribute prompt text, so there is no prompt-injection surface reachable
 * from the app itself.
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
  "4. Keep the same number of lines as the input, in the same order: exactly one rewritten line per input line.",
  "5. Keep each line under 200 characters, warm and plain-spoken. No lists, no headings, no preamble, no closing remarks.",
  "6. Output the rewritten lines only, one per line.",
].join("\n");

export interface CoachMessage {
  role: "system" | "user";
  content: string;
}

export function buildMessages(facts: InsightFact[], locale: CoachLocale): CoachMessage[] {
  const sources = facts.map(renderFactEnglish);
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

/** The deterministic sentences the output is validated against. */
export function sourceLines(facts: InsightFact[]): string[] {
  return facts.map(renderFactEnglish);
}
