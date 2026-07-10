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
  | { id: string; kind: "internetRadio" };

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
}[];

export type HomeSectionSettingKey =
  (typeof HOME_SECTION_CATALOG_ENTRIES)[number]["key"];

export const HOME_SECTION_CATALOG: readonly {
  key: HomeSectionSettingKey;
  labelKey: string;
  capability?: keyof BackendCapabilities;
}[] = HOME_SECTION_CATALOG_ENTRIES;

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
  capabilities: BackendCapabilities;
  sessionSeed: number;
  hiddenSections: readonly string[];
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
  capabilities,
  sessionSeed,
  hiddenSections,
}: BuildHomeFeedInput): HomeSectionDescriptor[] {
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

  // Filter after building (not by skipping pushes) so the seeded RNG consumes
  // the same sequence regardless of hidden sections — toggling one section
  // never reshuffles the other dynamic picks.
  const hidden = new Set(hiddenSections);
  return sections.filter(
    (section) => !hidden.has(homeSectionSettingKey(section)),
  );
}
