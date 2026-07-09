import de from "./de.json";
import en from "./en.json";
import fr from "./fr.json";
import it from "./it.json";
import ru from "./ru.json";
import zhCn from "./zh-CN.json";

export const languages = {
  en: "English",
  ru: "Русский",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  "zh-cn": "简体中文",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "en";

export type UiStrings = typeof en;

export const ui: Record<Lang, UiStrings> = {
  en,
  ru,
  fr,
  de,
  it,
  "zh-cn": zhCn,
};
