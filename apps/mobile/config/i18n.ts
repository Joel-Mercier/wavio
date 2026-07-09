import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as z from "zod";
import zodDe from "zod/v4/locales/de.js";
import zodEn from "zod/v4/locales/en.js";
import zodFr from "zod/v4/locales/fr.js";
import zodIt from "zod/v4/locales/it.js";
import zodRu from "zod/v4/locales/ru.js";
import zodCn from "zod/v4/locales/zh-CN.js";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import it from "@/i18n/it.json";
import ru from "@/i18n/ru.json";
import zhCn from "@/i18n/zh-CN.json";

const resources = {
  en,
  fr,
  de,
  it,
  "zh-CN": zhCn,
  ru,
};

export type TSupportedLanguages = keyof typeof resources;
export const SupportedLanguages = Object.keys(
  resources,
) as (keyof typeof resources)[];

export const LanguageNames: Record<TSupportedLanguages, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  "zh-CN": "简体中文",
  ru: "Русский",
};

const zodLocales = {
  en: zodEn,
  fr: zodFr,
  de: zodDe,
  "zh-CN": zodCn,
  ru: zodRu,
  it: zodIt,
} satisfies Record<TSupportedLanguages, () => { localeError: unknown }>;

export function applyZodLocale(locale: TSupportedLanguages) {
  z.config(zodLocales[locale]());
}

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    fallbackLng: "en",
    resources,
    debug: __DEV__,
    lng: "en", // language to use, more information here: https://www.i18next.com/overview/configuration-options#languages-namespaces-resources
    // you can use the i18n.changeLanguage function to change the language manually: https://www.i18next.com/overview/api#changelanguage
    // if you're using a language detector, do not define the lng option
    supportedLngs: SupportedLanguages,
    load: "currentOnly", // don't derive base codes (e.g. "zh" from "zh-CN"); we only support region-qualified locales
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

i18n.services?.formatter?.add("titlecase", (value) => {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
});

export default i18n;
