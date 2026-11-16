import { type ArtFallback, ROOT_ID } from "./types";

export const SECTION_KEYS = [
  "home",
  "library",
  "downloads",
  "recent",
  "favorites",
  "playlists",
  "albums",
  "artists",
  "genres",
  "radio",
  "mixes",
  "podcasts",
  "audiobooks",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const ROW_KEYS = [
  "recentlyPlayed",
  "newest",
  "frequent",
  "highest",
  "random",
  "leastPlayed",
  "starredAlbums",
  "mixes",
] as const;
export type RowKey = (typeof ROW_KEYS)[number];

export type FavoritesKind = "songs" | "albums" | "artists";
export type DownloadsKind = "albums" | "playlists" | "songs";
export type MixKind = "shuffleAll" | "random" | "artist" | "genre";
export type PodcastSource = "server" | "taddy";

export type MediaId =
  | { kind: "root" }
  | { kind: "section"; key: SectionKey }
  | { kind: "row"; key: RowKey }
  | { kind: "album"; id: string }
  | { kind: "playlist"; id: string }
  | { kind: "artist"; id: string }
  | { kind: "genre"; name: string }
  | { kind: "favorites"; of: FavoritesKind }
  | { kind: "downloads"; of: DownloadsKind }
  | { kind: "offlineCollection"; id: string }
  | { kind: "radioStation"; id: string }
  | { kind: "mix"; mix: MixKind; arg?: string }
  | { kind: "podcast"; source: PodcastSource; id: string }
  | { kind: "book"; id: string }
  | { kind: "search"; query: string }
  | { kind: "track"; parent: string; id: string }
  | { kind: "episode"; parent: string; id: string };

const enc = encodeURIComponent;
const dec = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isOneOf = <T extends string>(
  values: readonly T[],
  value: string,
): value is T => (values as readonly string[]).includes(value);

export function encodeMediaId(id: MediaId): string {
  switch (id.kind) {
    case "root":
      return ROOT_ID;
    case "section":
      return `section:${id.key}`;
    case "row":
      return `row:${id.key}`;
    case "album":
      return `album:${id.id}`;
    case "playlist":
      return `playlist:${id.id}`;
    case "artist":
      return `artist:${id.id}`;
    case "genre":
      return `genre:${enc(id.name)}`;
    case "favorites":
      return `favorites:${id.of}`;
    case "downloads":
      return `downloads:${id.of}`;
    case "offlineCollection":
      return `offline:${id.id}`;
    case "radioStation":
      return `radio:${id.id}`;
    case "mix":
      return id.arg === undefined
        ? `mix:${id.mix}`
        : `mix:${id.mix}:${enc(id.arg)}`;
    case "podcast":
      return `podcast:${id.source}:${id.id}`;
    case "book":
      return `book:${id.id}`;
    case "search":
      return `search:${enc(id.query)}`;
    case "track":
      return `track|${id.parent}|${id.id}`;
    case "episode":
      return `episode|${id.parent}|${id.id}`;
  }
}

function parseLeaf(kind: "track" | "episode", raw: string): MediaId | null {
  const parts = raw.split("|");
  if (parts.length < 3) return null;
  const parent = parts[1];
  const id = parts.slice(2).join("|");
  if (!parent || !id) return null;
  return { kind, parent, id };
}

export function parseMediaId(raw: string): MediaId | null {
  if (raw === ROOT_ID) return { kind: "root" };
  if (raw.startsWith("track|")) return parseLeaf("track", raw);
  if (raw.startsWith("episode|")) return parseLeaf("episode", raw);
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const prefix = raw.slice(0, colon);
  const rest = raw.slice(colon + 1);
  if (!rest) return null;
  switch (prefix) {
    case "section":
      return isOneOf(SECTION_KEYS, rest)
        ? { kind: "section", key: rest }
        : null;
    case "row":
      return isOneOf(ROW_KEYS, rest) ? { kind: "row", key: rest } : null;
    case "album":
      return { kind: "album", id: rest };
    case "playlist":
      return { kind: "playlist", id: rest };
    case "artist":
      return { kind: "artist", id: rest };
    case "genre":
      return { kind: "genre", name: dec(rest) };
    case "favorites":
      return rest === "songs" || rest === "albums" || rest === "artists"
        ? { kind: "favorites", of: rest }
        : null;
    case "downloads":
      return rest === "albums" || rest === "playlists" || rest === "songs"
        ? { kind: "downloads", of: rest }
        : null;
    case "offline":
      return { kind: "offlineCollection", id: rest };
    case "radio":
      return { kind: "radioStation", id: rest };
    case "mix": {
      const sep = rest.indexOf(":");
      const mix = sep === -1 ? rest : rest.slice(0, sep);
      if (!isOneOf(["shuffleAll", "random", "artist", "genre"], mix)) {
        return null;
      }
      return sep === -1
        ? { kind: "mix", mix }
        : { kind: "mix", mix, arg: dec(rest.slice(sep + 1)) };
    }
    case "podcast": {
      const sep = rest.indexOf(":");
      if (sep === -1) return null;
      const source = rest.slice(0, sep);
      const id = rest.slice(sep + 1);
      if ((source !== "server" && source !== "taddy") || !id) return null;
      return { kind: "podcast", source, id };
    }
    case "book":
      return { kind: "book", id: rest };
    case "search":
      return { kind: "search", query: dec(rest) };
    default:
      return null;
  }
}

export const trackId = (parent: string, id: string) =>
  encodeMediaId({ kind: "track", parent, id });

export const episodeId = (parent: string, id: string) =>
  encodeMediaId({ kind: "episode", parent, id });

export function artFallbackFor(raw: string): ArtFallback | undefined {
  const id = parseMediaId(raw);
  switch (id?.kind) {
    case "album":
      return "album";
    case "playlist":
      return "playlist";
    case "artist":
      return "artist";
    case "offlineCollection":
      return id.id.startsWith("album-") ? "album" : "playlist";
    case "radioStation":
      return "radio";
    case "mix":
      return id.mix === "artist" ? "artist" : "playlist";
    case "podcast":
    case "episode":
      return "podcast";
    case "book":
      return "audiobook";
    case "track":
      return "track";
    default:
      return undefined;
  }
}
