"use client";

import { useProfiles } from "@/components/app/ProfileProvider";
import { localeOf, useTranslator, type Locale, type Translator } from "./index";

/** Translator bound to the active profile's locale preference. */
export function useT(): { t: Translator; locale: Locale } {
  const { profile } = useProfiles();
  const locale = localeOf(profile);
  const t = useTranslator(locale);
  return { t, locale };
}
