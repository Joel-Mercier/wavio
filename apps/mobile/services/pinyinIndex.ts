import { pinyin } from "pinyin-pro";
import type { ArtistID3, IndexID3 } from "@/services/openSubsonic/types";

const CJK = /[㐀-鿿豈-﫿]/;

export function hasCJK(text: string): boolean {
  return CJK.test(text);
}

function foldDiacritics(char: string): string {
  return char.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function stripLeadingArticle(name: string, ignoredArticles?: string): string {
  const trimmed = name.trimStart();
  if (!ignoredArticles) return trimmed;
  for (const article of ignoredArticles.split(/\s+/)) {
    if (!article) continue;
    const prefix = `${article} `;
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      return trimmed.slice(prefix.length).trimStart();
    }
  }
  return trimmed;
}

const PINYIN_FIRST_OPTS = {
  pattern: "first",
  toneType: "none",
  mode: "surname",
  surname: "head",
  type: "array",
} as const;

export function indexLetter(name: string, ignoredArticles?: string): string {
  const meaningful = stripLeadingArticle(name ?? "", ignoredArticles);
  const first = [...meaningful][0];
  if (!first) return "#";
  const latin = foldDiacritics(first).toUpperCase();
  if (/[A-Z]/.test(latin)) return latin;
  if (hasCJK(first)) {
    const initial = pinyin(first, PINYIN_FIRST_OPTS)[0];
    if (initial) return initial.toUpperCase();
  }
  return "#";
}

const PINYIN_FULL_OPTS = {
  toneType: "none",
  mode: "surname",
  surname: "head",
} as const;

export function sortKey(name: string, ignoredArticles?: string): string {
  const meaningful = stripLeadingArticle(name ?? "", ignoredArticles);
  const value = hasCJK(meaningful)
    ? pinyin(meaningful, PINYIN_FULL_OPTS)
    : meaningful;
  return value.toLowerCase();
}

// The index bar is A–Z with a trailing "#" for everything else.
function compareLetters(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "#") return 1;
  if (b === "#") return -1;
  return a.localeCompare(b);
}

export function buildArtistIndex(
  artists: ArtistID3[],
  opts?: { ignoredArticles?: string },
): IndexID3[] {
  const ignoredArticles = opts?.ignoredArticles;
  const buckets = new Map<string, ArtistID3[]>();
  for (const artist of artists) {
    const letter = indexLetter(artist.name ?? "", ignoredArticles);
    const bucket = buckets.get(letter);
    if (bucket) bucket.push(artist);
    else buckets.set(letter, [artist]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => compareLetters(a, b))
    .map(([name, bucketArtists]) => ({
      name,
      artist: bucketArtists.sort((a, b) =>
        sortKey(a.name ?? "", ignoredArticles).localeCompare(
          sortKey(b.name ?? "", ignoredArticles),
        ),
      ),
    }));
}
