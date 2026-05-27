import { ui, defaultLang, languages, type Lang } from './ui'

/** Return the translation dictionary for a given language. */
export function useTranslations(lang: Lang) {
	return ui[lang]
}

/** Extract the active language from a URL pathname (defaults to `defaultLang`). */
export function getLangFromUrl(url: URL): Lang {
	const [, segment] = url.pathname.split('/')
	if (segment && segment in ui) return segment as Lang
	return defaultLang
}

/** Strip the locale prefix from a pathname, returning the locale-agnostic path. */
export function stripLangFromPath(pathname: string): string {
	for (const lang of Object.keys(languages)) {
		if (lang === defaultLang) continue
		if (pathname === `/${lang}`) return '/'
		if (pathname.startsWith(`/${lang}/`)) return pathname.slice(lang.length + 1)
	}
	return pathname
}

/**
 * Prefix a locale-agnostic path with the language segment.
 * The default language is served from the root (no prefix).
 */
export function localizePath(path: string, lang: Lang): string {
	if (lang === defaultLang) return path || '/'
	const clean = path === '/' ? '' : path
	return `/${lang}${clean}`
}

export { ui, defaultLang, languages, type Lang }
