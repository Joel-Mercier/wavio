import en from "@/i18n/en";
import fr from "@/i18n/fr";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
	en,
	fr,
};

export type TSupportedLanguages = keyof typeof resources;
export const SupportedLanguages = Object.keys(
	resources,
) as (keyof typeof resources)[];

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
		interpolation: {
			escapeValue: false, // react already safes from xss
		},
	});

export default i18n;
