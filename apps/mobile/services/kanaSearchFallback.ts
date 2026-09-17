import { getWanakana, hasKana, romajiSpellings } from "@/services/searchText";

// Romaji ⇄ kana retry for searches the *server* answers. Client-side indexes
// (Fuse, local FTS) romanise kana at index time, so a romaji query reaches a
// kana name there; a server's index is what it is, so the only lever is the
// query. This turns a Latin query into its hiragana and katakana forms, and a
// kana query into its romaji and other-script forms, and asks again with each.
//
// Only the words that convert are converted — `yorushika live` becomes
// `ヨルシカ live`, which the servers AND as usual — and a query where nothing
// converts yields no variants at all. Kanji never converts: it has no
// deterministic reading.

const LATIN_WORD = /^[a-z]+$/i;

type Script = "romaji" | "hiragana" | "katakana";

// A Latin word converts only if it is romaji through and through: wanakana
// turns any Latin run into *something* (`live` → `ぃゔぇ`), so demand that the
// kana reads back as the word.
function convertWord(word: string, script: Script): string | undefined {
  const { toHiragana, toKatakana, toRomaji, isKana } = getWanakana();
  if (hasKana(word)) {
    if (script === "romaji") return romajiSpellings(word)[0];
    const converted =
      script === "hiragana" ? toHiragana(word) : toKatakana(word);
    return converted === word ? undefined : converted;
  }
  if (script === "romaji" || !LATIN_WORD.test(word)) return undefined;
  const hiragana = toHiragana(word);
  if (!isKana(hiragana) || toRomaji(hiragana) !== word.toLowerCase()) {
    return undefined;
  }
  return script === "hiragana" ? hiragana : toKatakana(word);
}

export function kanaQueryVariants(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (!words.some((word) => hasKana(word) || LATIN_WORD.test(word))) return [];
  const variants = new Set<string>();
  for (const script of ["romaji", "hiragana", "katakana"] as const) {
    let converted = false;
    const form = words.map((word) => {
      const next = convertWord(word, script);
      if (next === undefined) return word;
      converted = true;
      return next;
    });
    const variant = form.join(" ");
    if (converted && variant !== query.trim()) variants.add(variant);
  }
  return [...variants];
}

// The three sections every Subsonic search envelope carries, with the count /
// offset option each one is paged by.
const SECTIONS = [
  { key: "artist", count: "artistCount", offset: "artistOffset" },
  { key: "album", count: "albumCount", offset: "albumOffset" },
  { key: "song", count: "songCount", offset: "songOffset" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];
type CountKey = (typeof SECTIONS)[number]["count"];
type OffsetKey = (typeof SECTIONS)[number]["offset"];

type SearchOptions = Partial<Record<CountKey | OffsetKey, number>> & {
  musicFolderId?: string;
};

type SearchResult = Partial<Record<SectionKey, Array<{ id: string }>>>;

type SearchFn<R extends SearchResult, E> = (
  query: string,
  opts: SearchOptions,
) => Promise<E>;

// Wrap a `search2` / `search3`-shaped function so that sections which came
// back empty on a first page are retried with the kana variants of the query.
// `pick` names the result inside the envelope; `place` writes it back.
//
// Only empty first pages retry, so the server's own ranking and pagination stay
// in charge whenever the plain query works, and a Latin query with a hit costs
// exactly one request. Variants run in parallel, each asking only for the
// sections that were empty; their hits fill those sections in variant order,
// deduped by id.
export function withKanaFallback<R extends SearchResult, E>(
  search: SearchFn<R, E>,
  pick: (envelope: E) => R | undefined,
  place: (envelope: E, result: R) => E,
): SearchFn<R, E> {
  return async (query, opts) => {
    const envelope = await search(query, opts);
    const result = pick(envelope);
    if (!result) return envelope;

    const empty = SECTIONS.filter(
      ({ key, count, offset }) =>
        opts[count] !== 0 &&
        (opts[offset] ?? 0) === 0 &&
        (result[key]?.length ?? 0) === 0,
    );
    if (empty.length === 0) return envelope;

    const variants = kanaQueryVariants(query);
    if (variants.length === 0) return envelope;

    const retryOpts: SearchOptions = { ...opts };
    for (const { count } of SECTIONS) {
      if (!empty.some((section) => section.count === count)) {
        retryOpts[count] = 0;
      }
    }
    const retries = await Promise.all(
      variants.map((variant) => search(variant, retryOpts)),
    );

    const filled: R = { ...result };
    for (const { key, count } of empty) {
      const seen = new Set<string>();
      const merged: Array<{ id: string }> = [];
      for (const retry of retries) {
        for (const item of pick(retry)?.[key] ?? []) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          merged.push(item);
        }
      }
      const limit = opts[count];
      filled[key] = (
        limit != null ? merged.slice(0, limit) : merged
      ) as R[typeof key];
    }
    return place(envelope, filled);
  };
}
