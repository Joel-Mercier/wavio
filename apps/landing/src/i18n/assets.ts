import type { ImageMetadata } from 'astro'
import { defaultLang, type Lang } from './ui'

/**
 * Eager glob of every locale-suffixed asset, named `<base>-<lang>.<ext>`
 * (e.g. `home-en.jpg`, `android-auto-fr.png`). Vite requires a static
 * literal pattern, so add new extensions here if you introduce them.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/*-{en,fr}.{png,jpg,jpeg,webp}',
  { eager: true },
)

// Index by "<base>-<lang>" (filename without extension) for O(1) lookup.
const byKey = new Map<string, ImageMetadata>()
for (const [path, mod] of Object.entries(modules)) {
  const key = path.split('/').pop()!.replace(/\.[^.]+$/, '')
  byKey.set(key, mod.default)
}

/**
 * Resolve a locale-specific image by its base name, falling back to the
 * default language when a translation is missing.
 */
export function localizedImage(base: string, lang: Lang): ImageMetadata {
  const hit = byKey.get(`${base}-${lang}`) ?? byKey.get(`${base}-${defaultLang}`)
  if (!hit) throw new Error(`No localized asset found for "${base}"`)
  return hit
}

/**
 * Bind a language once and get back an `img(base)` resolver. Call this in a
 * page/component (where `Astro.props.lang` is available) and reuse the result.
 */
export function useImages(lang: Lang) {
  return (base: string) => localizedImage(base, lang)
}
