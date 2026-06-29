import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as z from "zod";
import zodEn from "zod/v4/locales/en.js";
import zodFr from "zod/v4/locales/fr.js";
import zodRu from "zod/v4/locales/ru.js";
import zodCn from "zod/v4/locales/zh-CN.js";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import ru from "@/i18n/ru.json";
import zhCn from "@/i18n/zh-CN.json";

const resources = {
  en,
  fr,
  'zh-CN': zhCn,
  ru,
};

export type TSupportedLanguages = keyof typeof resources;
export const SupportedLanguages = Object.keys(
  resources,
) as (keyof typeof resources)[];

const zodLocales = {
  en: zodEn,
  fr: zodFr,
  'zh-CN': zodCn,
  ru: zodRu,
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
