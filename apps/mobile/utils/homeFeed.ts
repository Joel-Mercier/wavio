import type { Href } from "expo-router";
import type { BackendCapabilities } from "@/services/backend/capabilities";
import type { AlbumListType } from "@/services/backend/lists";
import type { AlbumID3, Genre } from "@/services/openSubsonic/types";
import { mulberry32, shuffle } from "@/utils/shuffle";

export type HomeSectionDescriptor =
  | { id: string; kind: "recentPlays" }
  | { id: string; kind: "nowPlaying" }
  | {
      id: string;
      kind: "albumList";
      albumType: AlbumListType;
      titleKey: string;
      seeAllHref: Href;
    }
  | {
      id: string;
      kind: "albumsByGenre";
      genre: string;
    }
  | {
      id: string;
      kind: "albumsByDecade";
      decade: number;
      fromYear: number;
      toYear: number;
    }
  | {
      id: string;
      kind: "moreFromArtist";
      artistId: string;
    }
  | {
      id: string;
      kind: "songsByGenre";
      genre: string;
    }
  | { id: string; kind: "randomSongs" }
  | { id: string; kind: "mostPlayedTracks" }
  | { id: string; kind: "randomArtists" }
  | { id: string; kind: "playlists" }
  | { id: string; kind: "starred" }
  | { id: string; kind: "podcasts" }
  | { id: string; kind: "internetRadio" }
  | { id: string; kind: "listenBrainzCreatedForYou" };

/**
 * A third-party account, rather than a server feature, that a section needs.
 *
 * Kept separate from BackendCapabilities because it answers a different
 * question: capabilities describe what the music server can do, integrations
 * whether the user has connected something else entirely.
 */
export type HomeSectionIntegration = "listenBrainz";

// One entry per user-toggleable section, in feed order. `key` is the stable
// value persisted in stores/app.ts hiddenHomeSections; dynamic kinds
// (moreFromArtist, songsByGenre, albumsByGenre, albumsByDecade) share one key
// across their instances.
const HOME_SECTION_CATALOG_ENTRIES = [
  {
    key: "recentPlays",
    labelKey: "app.settings.displaySettings.homeSections.recentPlays",
  },
  { key: "albumList:recent", labelKey: "app.home.recentlyPlayed" },
  { key: "albumList:newest", labelKey: "app.home.recentlyAdded" },
  { key: "albumList:frequent", labelKey: "app.home.mostPlayed" },
  {
    key: "moreFromArtist",
    labelKey: "app.settings.displaySettings.homeSections.moreFromArtist",
  },
  { key: "randomArtists", labelKey: "app.home.artists" },
  {
    key: "listenBrainzCreatedForYou",
    labelKey: "app.home.createdForYou",
    integration: "listenBrainz",
  },
  {
    key: "songsByGenre",
    labelKey: "app.settings.displaySettings.homeSections.songsByGenre",
    capability: "songLists",
  },
  {
    key: "albumsByDecade",
    labelKey: "app.settings.displaySettings.homeSections.albumsByDecade",
  },
  {
    key: "albumsByGenre",
    labelKey: "app.settings.displaySettings.homeSections.albumsByGenre",
  },
  {
    key: "mostPlayedTracks",
    labelKey: "app.home.mostPlayedTracks",
    capability: "mostPlayedTracks",
  },
  {
    key: "randomSongs",
    labelKey: "app.home.randomSongs",
    capability: "songLists",
  },
  { key: "playlists", labelKey: "app.home.yourPlaylists" },
  { key: "starred", labelKey: "app.home.starred" },
  {
    key: "nowPlaying",
    labelKey: "app.home.sections.nowPlaying",
    capability: "nowPlaying",
  },
  {
    key: "albumList:highest",
    labelKey: "app.home.topRated",
    capability: "setRating",
  },
  { key: "albumList:random", labelKey: "app.home.random" },
  { key: "podcasts", labelKey: "app.home.podcasts", capability: "podcasts" },
  {
    key: "internetRadio",
    labelKey: "app.home.internetRadioStations",
    capability: "internetRadio",
  },
] as const satisfies readonly {
  key: string;
  labelKey: string;
  capability?: keyof BackendCapabilities;
  integration?: HomeSectionIntegration;
}[];

export type HomeSectionSettingKey =
  (typeof HOME_SECTION_CATALOG_ENTRIES)[number]["key"];

export interface HomeSectionCatalogEntry {
  key: HomeSectionSettingKey;
  labelKey: string;
  capability?: keyof BackendCapabilities;
  integration?: HomeSectionIntegration;
}

export const HOME_SECTION_CATALOG: readonly HomeSectionCatalogEntry[] =
  HOME_SECTION_CATALOG_ENTRIES;

export type HomeSectionAvailability = {
  capabilities: BackendCapabilities;
  integrations: Record<HomeSectionIntegration, boolean>;
};

/**
 * Whether a section can appear at all, ignoring the user's own preference.
 *
 * One function rather than the predicate inlined at each call site: the feed,
 * the settings sheet and the "N sections" badge all have to agree, and they
 * previously carried two verbatim copies of the capability half of this.
 */
export function isHomeSectionAvailable(
  entry: Pick<HomeSectionCatalogEntry, "capability" | "integration">,
  { capabilities, integrations }: HomeSectionAvailability,
): boolean {
  if (entry.capability && !capabilities[entry.capability]) return false;
  if (entry.integration && !integrations[entry.integration]) return false;
  return true;
}

export function availableHomeSections(
  availability: HomeSectionAvailability,
): readonly HomeSectionCatalogEntry[] {
  return HOME_SECTION_CATALOG.filter((entry) =>
    isHomeSectionAvailable(entry, availability),
  );
}

const HOME_SECTION_CATALOG_KEYS: readonly HomeSectionSettingKey[] =
  HOME_SECTION_CATALOG.map((entry) => entry.key);

function dedupe(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

/**
 * Orders catalog entries (what the settings sheet lists) by a saved key order.
 *
 * Entries whose key is missing from `order` keep their catalog position at the
 * end, which `Array.prototype.sort` being stable gives for free.
 */
export function orderHomeSectionEntries(
  entries: readonly HomeSectionCatalogEntry[],
  order: readonly string[],
): HomeSectionCatalogEntry[] {
  if (order.length === 0) return [...entries];
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...entries].sort(
    (a, b) =>
      (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Applies a saved key order to an already-built feed.
 *
 * Descriptors are bucketed by their setting key, so the dynamic kinds that emit
 * several rows under one key (moreFromArtist, songsByGenre) keep their relative
 * order and land as one block at that key's slot. Keys missing from `order`
 * (sections shipped after it was saved) keep their built position at the end.
 * An empty `order` returns the feed untouched, which is what keeps the default
 * feed's interleaving of those dynamic rows intact.
 */
export function orderHomeSections(
  sections: HomeSectionDescriptor[],
  order: readonly string[],
): HomeSectionDescriptor[] {
  if (order.length === 0) return sections;

  const buckets = new Map<string, HomeSectionDescriptor[]>();
  for (const section of sections) {
    const key = homeSectionSettingKey(section);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(section);
    } else {
      buckets.set(key, [section]);
    }
  }

  const ordered: HomeSectionDescriptor[] = [];
  const placed = new Set<string>();
  for (const key of order) {
    if (placed.has(key)) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    placed.add(key);
    ordered.push(...bucket);
  }
  for (const section of sections) {
    if (!placed.has(homeSectionSettingKey(section))) ordered.push(section);
  }
  return ordered;
}

/**
 * Moves `visibleKeys[fromIndex]` to `toIndex` and returns the new full order.
 *
 * `visibleKeys` is only what the settings sheet shows on the current server, so
 * the move is replayed onto the stored order by re-inserting the key in front of
 * the visible key that now follows it. Keys the current server can't offer stay
 * pinned to that neighbour instead of being dropped, so editing the order on one
 * server never scrambles it on another.
 */
export function reorderHomeSectionKeys(
  stored: readonly string[],
  visibleKeys: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  // Bail before seeding: an out-of-range drop (the sheet's list shrank mid-drag)
  // must leave an untouched order empty, or the feed would silently swap its
  // default interleaving for the grouped layout without the user moving a thing.
  const moved = visibleKeys[fromIndex];
  if (moved === undefined) return [...stored];

  const base = dedupe(stored.length ? stored : HOME_SECTION_CATALOG_KEYS);
  for (const key of visibleKeys) {
    if (!base.includes(key)) base.push(key);
  }

  const nextVisible = [...visibleKeys];
  nextVisible.splice(fromIndex, 1);
  const target = Math.min(Math.max(toIndex, 0), nextVisible.length);
  nextVisible.splice(target, 0, moved);

  const rest = base.filter((key) => key !== moved);
  const anchor = nextVisible[target + 1];
  const anchorIndex = anchor === undefined ? -1 : rest.indexOf(anchor);
  rest.splice(anchorIndex < 0 ? rest.length : anchorIndex, 0, moved);
  return rest;
}

export function homeSectionSettingKey(
  descriptor: HomeSectionDescriptor,
): HomeSectionSettingKey {
  return descriptor.kind === "albumList"
    ? (`albumList:${descriptor.albumType}` as HomeSectionSettingKey)
    : descriptor.kind;
}

export interface BuildHomeFeedInput {
  seedAlbums: AlbumID3[];
  genres: Genre[];
  availability: HomeSectionAvailability;
  sessionSeed: number;
  hiddenSections: readonly string[];
  order: readonly string[];
}

function pickDecade(
  seedAlbums: AlbumID3[],
  rand: () => number,
): { decade: number; fromYear: number; toYear: number } | null {
  const buckets = new Map<number, number>();
  for (const a of seedAlbums) {
    if (!a.year || a.year < 1950) continue;
    const decade = Math.floor(a.year / 10) * 10;
    buckets.set(decade, (buckets.get(decade) ?? 0) + 1);
  }
  const candidates = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  if (!candidates.length) return null;
  // Pick from top-3 decades to add variety per session.
  const top = candidates.slice(0, 3);
  const chosen = top[Math.floor(rand() * top.length)];
  const decade = chosen[0];
  return { decade, fromYear: decade, toYear: decade + 9 };
}

export function buildHomeFeed({
  seedAlbums,
  genres,
  availability,
  sessionSeed,
  hiddenSections,
  order,
}: BuildHomeFeedInput): HomeSectionDescriptor[] {
  const { capabilities } = availability;
  const rand = mulberry32(sessionSeed || 1);

  const sections: HomeSectionDescriptor[] = [];

  sections.push({ id: "recentPlays", kind: "recentPlays" });
  sections.push({
    id: "albumList:recent",
    kind: "albumList",
    albumType: "recent",
    titleKey: "app.home.recentlyPlayed",
    seeAllHref: {
      pathname: "/(app)/(tabs)/(home)/recently-played",
      params: { type: "recent" },
    },
  });
  sections.push({
    id: "albumList:newest",
    kind: "albumList",
    albumType: "newest",
    titleKey: "app.home.recentlyAdded",
    seeAllHref: {
      pathname: "/(app)/(tabs)/(home)/recently-added",
      params: { type: "newest" },
    },
  });
  sections.push({
    id: "albumList:frequent",
    kind: "albumList",
    albumType: "frequent",
    titleKey: "app.home.mostPlayed",
    seeAllHref: {
      pathname: "/(app)/(tabs)/(home)/most-played",
      params: { type: "frequent" },
    },
  });

  // Dynamic interleaved picks.
  const seenArtists = new Set<string>();
  const featuredArtists: string[] = [];
  for (const album of shuffle(seedAlbums, rand)) {
    if (!album.artistId) continue;
    if (seenArtists.has(album.artistId)) continue;
    seenArtists.add(album.artistId);
    featuredArtists.push(album.artistId);
    if (featuredArtists.length >= 3) break;
  }

  if (featuredArtists[0]) {
    sections.push({
      id: `moreFromArtist:${featuredArtists[0]}`,
      kind: "moreFromArtist",
      artistId: featuredArtists[0],
    });
  }

  sections.push({ id: "randomArtists", kind: "randomArtists" });

  // Pushed unconditionally; the terminal filter drops it when ListenBrainz isn't
  // connected. Gating the push instead would be equivalent today but is exactly
  // the mistake the comment at the bottom of this function warns about.
  sections.push({
    id: "listenBrainzCreatedForYou",
    kind: "listenBrainzCreatedForYou",
  });

  // Genres from Navidrome's per-library endpoint carry no counts; treat them as
  // eligible for both rows (an empty byGenre section hides itself anyway).
  const songGenres = shuffle(
    genres.filter((g) => (g.songCount ?? 1) > 0).slice(0, 12),
    rand,
  );
  const albumGenres = shuffle(
    genres.filter((g) => (g.albumCount ?? 1) > 0).slice(0, 12),
    rand,
  );

  if (capabilities.songLists && songGenres[0]) {
    sections.push({
      id: `songsByGenre:${songGenres[0].value}`,
      kind: "songsByGenre",
      genre: songGenres[0].value,
    });
  }

  if (featuredArtists[1]) {
    sections.push({
      id: `moreFromArtist:${featuredArtists[1]}`,
      kind: "moreFromArtist",
      artistId: featuredArtists[1],
    });
  }

  const decade = pickDecade(seedAlbums, rand);
  if (decade) {
    sections.push({
      id: `albumsByDecade:${decade.decade}`,
      kind: "albumsByDecade",
      decade: decade.decade,
      fromYear: decade.fromYear,
      toYear: decade.toYear,
    });
  }

  // Use a different genre (not the same as the song one) for the albums row.
  const albumGenrePick =
    albumGenres.find((g) => g.value !== songGenres[0]?.value) ?? albumGenres[0];
  if (albumGenrePick) {
    sections.push({
      id: `albumsByGenre:${albumGenrePick.value}`,
      kind: "albumsByGenre",
      genre: albumGenrePick.value,
    });
  }

  if (capabilities.mostPlayedTracks) {
    sections.push({ id: "mostPlayedTracks", kind: "mostPlayedTracks" });
  }

  if (capabilities.songLists) {
    sections.push({ id: "randomSongs", kind: "randomSongs" });
  }

  if (featuredArtists[2]) {
    sections.push({
      id: `moreFromArtist:${featuredArtists[2]}`,
      kind: "moreFromArtist",
      artistId: featuredArtists[2],
    });
  }

  if (
    capabilities.songLists &&
    songGenres[1] &&
    songGenres[1].value !== songGenres[0]?.value
  ) {
    sections.push({
      id: `songsByGenre:${songGenres[1].value}`,
      kind: "songsByGenre",
      genre: songGenres[1].value,
    });
  }

  sections.push({ id: "playlists", kind: "playlists" });

  sections.push({ id: "starred", kind: "starred" });

  if (capabilities.nowPlaying) {
    sections.push({ id: "nowPlaying", kind: "nowPlaying" });
  }

  if (capabilities.setRating) {
    sections.push({
      id: "albumList:highest",
      kind: "albumList",
      albumType: "highest",
      titleKey: "app.home.topRated",
      seeAllHref: {
        pathname: "/(app)/(tabs)/(home)/highest-rated",
        params: { type: "highest" },
      },
    });
  }

  sections.push({
    id: "albumList:random",
    kind: "albumList",
    albumType: "random",
    titleKey: "app.home.random",
    seeAllHref: {
      pathname: "/(app)/(tabs)/(home)/random",
      params: { type: "random" },
    },
  });

  if (capabilities.podcasts) {
    sections.push({ id: "podcasts", kind: "podcasts" });
  }

  if (capabilities.internetRadio) {
    sections.push({ id: "internetRadio", kind: "internetRadio" });
  }

  // Filter (and reorder) after building, not by skipping pushes, so the seeded
  // RNG consumes the same sequence regardless of hidden or unavailable sections
  // and of the user's order — toggling one section, connecting an integration or
  // dragging a badge never reshuffles the other dynamic picks.
  const hidden = new Set(hiddenSections);
  const byKey = new Map(
    HOME_SECTION_CATALOG.map((entry) => [entry.key, entry]),
  );
  const visible = sections.filter((section) => {
    const key = homeSectionSettingKey(section);
    if (hidden.has(key)) return false;
    const entry = byKey.get(key);
    return !entry || isHomeSectionAvailable(entry, availability);
  });
  return orderHomeSections(visible, order);
}
