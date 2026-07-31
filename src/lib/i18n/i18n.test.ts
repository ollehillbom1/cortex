import { describe, expect, it } from "vitest";
import { resolveLocale, speechLang, translate } from "./index";
import { SV } from "./sv";

describe("i18n", () => {
  it("falls back to the English source string when untranslated", () => {
    expect(translate("sv", "Some string that will never be translated")).toBe(
      "Some string that will never be translated",
    );
    expect(translate("en", "Today")).toBe("Today");
  });

  it("translates known strings to Swedish", () => {
    expect(translate("sv", "Today")).toBe("Idag");
    expect(translate("sv", "Start session")).toBe("Starta pass");
  });

  it("interpolates placeholders in both locales", () => {
    expect(translate("en", "Level {n}", { n: 4 })).toBe("Level 4");
    expect(translate("sv", "Level {n}", { n: 4 })).toBe("Nivå 4");
    expect(translate("sv", "about {min} min · {count} exercises", { min: 8, count: 4 })).toBe(
      "ca 8 min · 4 övningar",
    );
    // Unknown placeholders are left intact rather than replaced with garbage.
    expect(translate("en", "Level {n}", { other: 1 })).toBe("Level {n}");
  });

  it("resolves explicit locale preferences; auto falls back to en outside a browser", () => {
    expect(resolveLocale("sv")).toBe("sv");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("auto")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
  });

  it("maps locales to speech synthesis languages", () => {
    expect(speechLang("sv")).toBe("sv-SE");
    expect(speechLang("en")).toBe("en-US");
  });

  it("has no empty or identical-by-accident translations", () => {
    for (const [key, value] of Object.entries(SV)) {
      expect(value.length, key).toBeGreaterThan(0);
      // Placeholders present in the key must survive translation.
      const placeholders = key.match(/\{\w+\}/g) ?? [];
      for (const ph of placeholders) {
        expect(value, `${key} is missing ${ph}`).toContain(ph);
      }
    }
  });
});
