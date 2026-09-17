// Query/haystack normalisation shared by every client-side matcher (Fuse
// indexes, offline substring filters, the Jellyfin fallback filter and the local
// FTS `normalized` column). Mirrors what the servers do on their side —
// Navidrome's `SanitizeStrings`/`NormalizeForFTS` and Jellyfin 12's
// `GetCleanValue` both casefold, strip accents and drop punctuation — so a query
// behaves the same whichever backend answers it.
//
// Punctuation is *removed*, not replaced by a space: `B.I.G.` → `big`,
// `a-ha` → `aha`, `Don't` → `dont`. That is Navidrome's concat form; substring
// and fuzzy matchers don't need word boundaries, and it lets an unpunctuated
// query hit punctuated data (and vice versa) without a second form.

const canNormalize = typeof String.prototype.normalize === "function";

// U+0300–U+036F only: Latin/Greek/Cyrillic combining diacriticals. Stripping
// every `\p{M}` would also delete Japanese dakuten and Indic vowel signs.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Letters NFKD leaves alone because they aren't base+mark compositions.
const NON_DECOMPOSABLE: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ı: "i",
  ħ: "h",
  ŧ: "t",
  þ: "th",
  ð: "d",
};
const NON_DECOMPOSABLE_RE = new RegExp(
  `[${Object.keys(NON_DECOMPOSABLE).join("")}]`,
  "g",
);

// `\p{M}` stays so the marks kept above (dakuten, Indic vowel signs) survive.
const NOT_WORD_CHAR = /[^\p{L}\p{M}\p{N}\s]/gu;
const WHITESPACE = /\s+/g;

// Hiragana, katakana and half-width katakana. Kanji is deliberately absent:
// a kanji name has no deterministic reading, so nothing below can help it.
const KANA = /[぀-ヿｦ-ﾟ]/;

export function hasKana(text: string): boolean {
  return KANA.test(text);
}

// This module is on the cold-start graph (services/local/db.ts and the backend
// dispatch both import it), so wanakana is required on the first kana word
// rather than at module load — a Latin-only library never pays for it. Same
// arrangement as pinyin-pro in services/pinyinIndex.ts.
let wanakana: typeof import("wanakana") | undefined;

export function getWanakana() {
  if (!wanakana) {
    wanakana = require("wanakana") as typeof import("wanakana");
  }
  return wanakana;
}

// wanakana romanises トウキョウ as `toukyou`; people type `tokyo`, `toukyou` or
// `tōkyō` (the macron folds to `tokyo` through NFKD above). Emitting the
// collapsed spelling beside the literal one lets any of them hit.
function collapseLongVowels(romaji: string): string {
  return romaji
    .replace(/ou|oo/g, "o")
    .replace(/uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/ii/g, "i")
    .replace(/ee/g, "e");
}

// Romaji spellings of a word containing kana, in the same normalised form as
// everything else here, minus any that equal the normalised word itself. Kanji
// inside the word is left as-is (`ずっと真夜中でいいのに。` → `zutto真夜中deiinoni`),
// which prefix and fuzzy matchers still handle. Empty for a word without kana.
export function romajiSpellings(word: string): string[] {
  if (!hasKana(word)) return [];
  const normalizedWord = normalizeSearchText(word);
  // NFKC folds half-width katakana to full-width, which wanakana can read.
  const romaji = normalizeSearchText(
    getWanakana().toRomaji(word.normalize("NFKC")),
  );
  const spellings = new Set<string>();
  for (const spelling of [romaji, collapseLongVowels(romaji)]) {
    if (spelling && spelling !== normalizedWord) spellings.add(spelling);
  }
  return [...spellings];
}

export function normalizeSearchText(value: string): string {
  const decomposed = canNormalize
    ? value.normalize("NFKD").replace(COMBINING_MARKS, "")
    : value;
  const stripped = decomposed
    .toLowerCase()
    .replace(NON_DECOMPOSABLE_RE, (ch) => NON_DECOMPOSABLE[ch] ?? ch)
    .replace(NOT_WORD_CHAR, "")
    .replace(WHITESPACE, " ")
    .trim();
  return canNormalize ? stripped.normalize("NFC") : stripped;
}

// Kana words are *replaced* by their romaji, on the query and on the indexed
// side alike (Fuse runs this same tokenizer at index time), so `yorushika`,
// `よるしか` and `ヨルシカ` all meet as `yorushika`. Replaced rather than added:
// an AND matcher would otherwise still demand the kana token, and hiragana
// never equals katakana.
export function searchTokens(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized.split(" ").flatMap((token) => {
    if (!hasKana(token)) return [token];
    const romaji = romajiSpellings(token);
    return romaji.length ? romaji : [token];
  });
}

// A query made only of punctuation ("!!!", "+/-") normalises to nothing; match
// it literally instead of matching everything or nothing.
export function isLiteralQuery(query: string): boolean {
  return query.trim().length > 0 && normalizeSearchText(query) === "";
}

type HaystackInput = string | Array<string | undefined | null>;

export type SearchHaystack = { raw: string[]; normalized: string };

// Precompute once per row when filtering a large list on every keystroke; the
// normalisation is the expensive half of a match.
export function toSearchHaystack(values: HaystackInput): SearchHaystack {
  const raw = (Array.isArray(values) ? values : [values]).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return {
    raw,
    normalized: raw.map((v) => searchTokens(v).join(" ")).join(" "),
  };
}

export type SearchMatcher = (haystack: SearchHaystack) => boolean;

// `null` for a blank query so callers can short-circuit to "show everything".
export function createSearchMatcher(query: string): SearchMatcher | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (isLiteralQuery(trimmed)) {
    const needle = trimmed.toLowerCase();
    return ({ raw }) => raw.some((v) => v.toLowerCase().includes(needle));
  }
  const tokens = searchTokens(trimmed);
  return ({ normalized }) =>
    tokens.every((token) => normalized.includes(token));
}

export function matchesAllTokens(
  haystack: HaystackInput,
  query: string,
): boolean {
  const matcher = createSearchMatcher(query);
  return matcher ? matcher(toSearchHaystack(haystack)) : false;
}

// Alphanumeric runs of the *raw* query, longest first. Unlike `searchTokens`
// these never straddle punctuation, so a run is a safe substring of the
// original text as well as of its normalised form (`notorious` is in both
// `The Notorious B.I.G.` and `the notorious big`; `big` only in the latter).
export function alphanumericRuns(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .filter((run) => run.length > 0)
    .sort((a, b) => b.length - a.length);
}

// Extra searchable spellings for a full-text index over the given fields: the
// normalised form of every word that differs from the word itself, plus the
// romaji of every kana word, deduped and space-joined (Navidrome's
// `NormalizeForFTS`). Stored beside the raw columns so `big` finds "B.I.G.",
// `haed` finds "Hæd" and `yorushika` finds "ヨルシカ" while the raw columns
// keep matching the original spelling.
export function searchVariants(
  values: Array<string | undefined | null>,
): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const word of value.split(/\s+/)) {
      if (!word) continue;
      const variant = normalizeSearchText(word);
      if (variant && variant !== word.toLowerCase()) seen.add(variant);
      for (const romaji of romajiSpellings(word)) seen.add(romaji);
    }
  }
  return [...seen].join(" ");
}
