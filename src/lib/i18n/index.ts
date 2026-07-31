import { useCallback } from "react";
import type { Profile } from "@/lib/domain/types";
import { SV } from "./sv";

/**
 * Minimal dependency-free i18n (issue #5).
 *
 * English source strings are the keys (gettext style); locale dictionaries
 * map them to translations. Unknown strings fall back to English, so the app
 * never breaks on a missing translation. `{name}` placeholders interpolate.
 */

export type Locale = "en" | "sv";
export type LocalePreference = Locale | "auto";

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: {},
  sv: SV,
};

export function resolveLocale(preference: LocalePreference | undefined): Locale {
  if (preference === "en" || preference === "sv") return preference;
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("sv")) {
    return "sv";
  }
  return "en";
}

export type Translator = (text: string, vars?: Record<string, string | number>) => string;

export function translate(
  locale: Locale,
  text: string,
  vars?: Record<string, string | number>,
): string {
  const template = DICTIONARIES[locale][text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** BCP-47 tag for speech synthesis in the active locale. */
export function speechLang(locale: Locale): string {
  return locale === "sv" ? "sv-SE" : "en-US";
}

export function localeOf(profile: Profile | null): Locale {
  return resolveLocale(profile?.preferences.locale);
}

/** Translator bound to a locale; stable identity per locale for memo use. */
export function useTranslator(locale: Locale): Translator {
  return useCallback<Translator>((text, vars) => translate(locale, text, vars), [locale]);
}
