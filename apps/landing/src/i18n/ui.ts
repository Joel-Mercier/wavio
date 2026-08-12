import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";
import it from "./it.json";
import ru from "./ru.json";
import es from "./es.json";
import zhCn from "./zh-CN.json";

export const languages = {
  en: "English",
  ru: "Русский",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
  "zh-cn": "简体中文",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "en";

export type UiStrings = typeof en;

type Dict = Record<string, unknown>;

/** Locale files lag behind `en.json` until Crowdin syncs, so fill missing keys with English. */
function withFallback(dict: Dict, fallback: Dict = en): UiStrings {
  const merged: Dict = { ...fallback };
  for (const [key, value] of Object.entries(dict)) {
    const base = fallback[key];
    const mergeable =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof base === "object" &&
      base !== null;
    merged[key] = mergeable
      ? withFallback(value as Dict, base as Dict)
      : value;
  }
  return merged as UiStrings;
}

export const ui: Record<Lang, UiStrings> = {
  en,
  ru: withFallback(ru),
  fr: withFallback(fr),
  de: withFallback(de),
  it: withFallback(it),
  es: withFallback(es),
  "zh-cn": withFallback(zhCn),
};
