import type { Href } from "expo-router";
import type { BackendCapabilities } from "@/services/backend/capabilities";
import type { AlbumListType } from "@/services/backend/lists";
import type { AlbumID3, Genre } from "@/services/openSubsonic/types";

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
  | { id: string; kind: "starred" }
  | { id: string; kind: "internetRadio" };

export interface BuildHomeFeedInput {
  seedAlbums: AlbumID3[];
  genres: Genre[];
  capabilities: BackendCapabilities;
  sessionSeed: number;
}

// Tiny deterministic PRNG so the same sessionSeed produces the same picks.
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
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

  const songGenres = shuffle(
    genres.filter((g) => g.songCount > 0).slice(0, 12),
    rand,
  );
  const albumGenres = shuffle(
    genres.filter((g) => g.albumCount > 0).slice(0, 12),
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

  if (capabilities.internetRadio) {
    sections.push({ id: "internetRadio", kind: "internetRadio" });
  }

  return sections;
}
