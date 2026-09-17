import Fuse, { type FuseResult, type IFuseOptions } from "fuse.js";
import {
  isLiteralQuery,
  normalizeSearchText,
  searchTokens,
} from "@/services/searchText";

// One Fuse configuration for every in-app search over music metadata, so the
// library, playlist, favourites, downloads and offline searches all answer a
// query the way the servers do (see services/searchText.ts): each word of the
// query must match somewhere in the record, in any order, with punctuation and
// accents ignored on both sides. Token search runs each word as its own fuzzy
// match, which is what lets "tyler creator" find "Tyler, the Creator" with a
// perfect score instead of paying for the missing ", the" as edit distance.
//
// Field values are normalised through `getFn` at index time and the query
// through `tokenize`, so both sides see the same text. Fuse's own
// `ignoreDiacritics` is left off: `normalizeSearchText` already folds accents
// and Fuse's wider `\p{M}` strip would also erase Japanese dakuten.

// ≤3-char words must match exactly; longer ones tolerate one typo. The 0.4
// used before let "big" fuzz onto "sigur".
const THRESHOLD = 0.3;

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return normalizeSearchText(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  return value;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
}

export type SearchIndexOptions = Pick<IFuseOptions<unknown>, "threshold">;

export class SearchIndex<T> {
  private readonly fuse: Fuse<T>;

  constructor(
    private readonly items: ReadonlyArray<T>,
    private readonly keys: string[],
    options: SearchIndexOptions = {},
  ) {
    this.fuse = new Fuse<T>(items, {
      keys,
      useTokenSearch: true,
      tokenMatch: "all",
      threshold: THRESHOLD,
      includeScore: true,
      ...options,
      getFn: (obj, path) =>
        normalizeValue(Fuse.config.getFn(obj, path)) as string | string[],
      tokenize: searchTokens,
    });
  }

  search(query: string, limit?: number): FuseResult<T>[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    if (isLiteralQuery(trimmed)) return this.searchLiteral(trimmed, limit);
    return this.fuse.search(trimmed, limit != null ? { limit } : undefined);
  }

  // "!!!" or "+/-" normalise to nothing: fall back to a literal substring
  // match on the raw field values so those names stay reachable.
  private searchLiteral(query: string, limit?: number): FuseResult<T>[] {
    const needle = query.toLowerCase();
    const results: FuseResult<T>[] = [];
    this.items.forEach((item, refIndex) => {
      const hit = this.keys.some((key) =>
        stringValues(Fuse.config.getFn(item, key)).some((v) =>
          v.toLowerCase().includes(needle),
        ),
      );
      if (hit) results.push({ item, refIndex, score: 0 });
    });
    return limit != null ? results.slice(0, limit) : results;
  }
}

export function createSearchIndex<T>(
  items: ReadonlyArray<T>,
  keys: string[],
  options?: SearchIndexOptions,
): SearchIndex<T> {
  return new SearchIndex(items, keys, options);
}
