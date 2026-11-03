import { queryClient } from "@/config/queryClient";
import {
  findSimilarArtists,
  matchSimilarArtists,
  SIMILAR_ARTISTS_DEFAULT_RESULTS,
} from "@/services/audioMuse/artists";
import {
  getAlbum,
  getArtist,
  getArtistInfo2,
  getArtists,
  getArtistsByIds,
} from "@/services/backend/browsing";
import { getRandomSongs } from "@/services/backend/lists";
import {
  canUseLastFmRecommendations,
  resolveSimilarArtists,
} from "@/services/lastFm/recommendations";
import { fetchSimilarArtists } from "@/services/lastFm/similar";
import { currentLibraryCapabilities } from "@/services/libraryContext";
import {
  curateMix,
  mixArtistKey,
  mixArtistKeys,
} from "@/services/mixes/curate";
import type {
  ArtistID3,
  ArtistInfo2,
  ArtistsID3,
  Child,
} from "@/services/openSubsonic/types";
import { fetchTopSongs } from "@/services/topSongs";
import {
  selectSimilarArtistsAvailable,
  useAudioMuseBase,
} from "@/stores/audioMuse";
import { isArtistInLibrary } from "@/utils/artistPresence";
import { mapWithConcurrency } from "@/utils/mapWithConcurrency";
import { AbortedError } from "@/utils/rateLimitedQueue";
import { shuffle } from "@/utils/shuffle";

export const MIX_TARGET = 50;
const SIMILAR_ARTIST_LIMIT = 12;
// A tier that already named this many artists is enough to build from; the
// next ones cost requests to third parties and only run to fill a short list.
const ENOUGH_SIMILAR_ARTISTS = 6;
const LASTFM_CANDIDATES = 60;
const TOP_SONGS_COUNT = 10;
const MAX_PER_ARTIST = 2;
const SEED_SHARE = 0.2;
const MIN_SPACING = 3;
const FALLBACK_GENRES = 2;
const FALLBACK_GENRE_SIZE = 100;
const POOL_CONCURRENCY = 4;

// What the artist screen asks getArtistInfo2 for, and so what the cache holds.
// `includeNotPresent` keeps the recommendations the library doesn't hold:
// they're the discovery half of its row, and ArtistCarouselRow renders them as
// their own kind of tile rather than a link to a detail screen.
export const ARTIST_SCREEN_SIMILAR_PARAMS = {
  count: SIMILAR_ARTISTS_DEFAULT_RESULTS,
  includeNotPresent: true,
};

export type MixArtist = { id: string; name: string };

export type GeneratedMix = {
  tracks: Child[];
  /** The artists the mix leans on, strongest first, for the screen subtitle. */
  featuredArtists: string[];
};

type ArtistInfo2Response = { artistInfo2?: ArtistInfo2 };

type SimilarArtistSource = (
  seed: { id: string; name: string; musicBrainzId?: string },
  context: { musicFolderIds?: string[]; signal?: AbortSignal },
) => Promise<MixArtist[]>;

// A mix can only play what the library holds.
function presentSimilarArtists(rsp: ArtistInfo2Response | undefined) {
  return (rsp?.artistInfo2?.similarArtist ?? [])
    .filter(isArtistInLibrary)
    .map(({ id, name }) => ({ id, name }));
}

// The artist screen that launched the mix has usually just fetched this. Its
// answer includes artists the library doesn't hold, so it is only reused when
// enough of the rest are left to build from.
const fromServer: SimilarArtistSource = async ({ id }) => {
  if (!currentLibraryCapabilities().extendedMetadata) return [];
  const fromScreen = presentSimilarArtists(
    queryClient.getQueryData<ArtistInfo2Response>([
      "artistInfo2",
      id,
      ARTIST_SCREEN_SIMILAR_PARAMS,
    ]),
  );
  if (fromScreen.length >= ENOUGH_SIMILAR_ARTISTS) return fromScreen;
  const params = { count: SIMILAR_ARTIST_LIMIT, includeNotPresent: false };
  return presentSimilarArtists(
    await queryClient.fetchQuery({
      queryKey: ["artistInfo2", id, params],
      queryFn: () => getArtistInfo2(id, params),
    }),
  );
};

// The same key useArtists caches the index under, so the artists tab has
// usually paid for it already.
const artistsIndexKey = (musicFolderIds?: string[]) => [
  "artists",
  { musicFolderIds },
];

function flattenIndex(index: { artists?: ArtistsID3 }): ArtistID3[] {
  return index.artists?.index?.flatMap((entry) => entry.artist ?? []) ?? [];
}

const fromAudioMuse: SimilarArtistSource = async (
  { name },
  { musicFolderIds, signal },
) => {
  if (!selectSimilarArtistsAvailable(useAudioMuseBase.getState())) return [];
  const rows = await findSimilarArtists({
    artistName: name,
    numResults: SIMILAR_ARTIST_LIMIT,
    signal,
  });
  if (rows.length === 0) return [];
  throwIfAborted(signal);
  // Without a cached index, checking just the ids is far cheaper than pulling
  // the whole index, at the cost of not recovering null-id rows by name.
  const cached = queryClient.getQueryData<{ artists?: ArtistsID3 }>(
    artistsIndexKey(musicFolderIds),
  );
  const pool = cached
    ? flattenIndex(cached)
    : await getArtistsByIds(
        rows.flatMap((row) => (row.artist_id ? [row.artist_id] : [])),
      );
  return matchSimilarArtists(rows, pool).map(({ id, name }) => ({ id, name }));
};

const fromLastFm: SimilarArtistSource = async (
  { name, musicBrainzId },
  { musicFolderIds, signal },
) => {
  if (!canUseLastFmRecommendations()) return [];
  const lookup = (mbid?: string) =>
    fetchSimilarArtists({
      artist: name,
      mbid,
      limit: LASTFM_CANDIDATES,
      signal,
    });
  // Last.fm answers an mbid it doesn't know (or has merged) with "artist not
  // found", while the name, autocorrected, often still resolves.
  let similar = musicBrainzId
    ? await lookup(musicBrainzId).catch(() => [])
    : [];
  if (similar.length === 0) similar = await lookup();
  if (similar.length === 0) return [];
  throwIfAborted(signal);
  const index = await queryClient.ensureQueryData({
    queryKey: artistsIndexKey(musicFolderIds),
    queryFn: () => getArtists({ musicFolderIds }),
  });
  return resolveSimilarArtists(
    similar,
    flattenIndex(index),
    SIMILAR_ARTIST_LIMIT,
  ).map(({ id, name }) => ({ id, name }));
};

const SOURCES: SimilarArtistSource[] = [fromServer, fromAudioMuse, fromLastFm];

export async function resolveMixArtists(
  seed: { id: string; name: string; musicBrainzId?: string },
  context: { musicFolderIds?: string[]; signal?: AbortSignal },
): Promise<MixArtist[]> {
  const picked: MixArtist[] = [];
  const taken = new Set<string>([seed.id]);
  for (const source of SOURCES) {
    if (picked.length >= ENOUGH_SIMILAR_ARTISTS) break;
    throwIfAborted(context.signal);
    // Every tier is best-effort: an artist the server has no info for, an
    // AudioMuse index that was never built or Last.fm being down only means the
    // next tier gets asked. A cancelled mix is not a failed tier.
    const artists = await source(seed, context).catch((error) => {
      if (context.signal?.aborted) throw error;
      return [];
    });
    for (const artist of artists) {
      if (picked.length >= SIMILAR_ARTIST_LIMIT) break;
      if (taken.has(artist.id)) continue;
      taken.add(artist.id);
      picked.push(artist);
    }
  }
  return picked;
}

// Top songs alone would make every mix the same ten hits per artist — and come
// back empty on a Navidrome without an external agent — so they are topped up
// with whole albums picked at random.
async function artistPool(
  artist: MixArtist,
  albumSamples: number,
  rand: () => number,
  signal?: AbortSignal,
): Promise<Child[]> {
  throwIfAborted(signal);
  const [topSongs, albums] = await Promise.all([
    fetchTopSongs({
      id: artist.id,
      name: artist.name,
      count: TOP_SONGS_COUNT,
    }).catch(() => []),
    getArtist(artist.id)
      .then((rsp) => rsp.artist?.album ?? [])
      .catch(() => []),
  ]);
  throwIfAborted(signal);
  const sampled = await Promise.all(
    shuffle(albums, rand)
      .slice(0, albumSamples)
      .map((album) =>
        getAlbum(album.id)
          .then((rsp) => rsp.album?.song ?? [])
          .catch(() => []),
      ),
  );
  return [...topSongs, ...sampled.flat()];
}

function dominantGenres(tracks: readonly Child[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    const names = track.genres?.length
      ? track.genres.map((genre) => genre.name)
      : track.genre
        ? [track.genre]
        : [];
    for (const name of names) {
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

// An artist nobody is similar to — the norm on a local library with no Last.fm
// account — still has genres, and every backend can draw random songs from one.
async function genreFallbackPool(
  seedPool: readonly Child[],
  musicFolderIds: string[] | undefined,
  signal?: AbortSignal,
): Promise<Child[]> {
  if (!currentLibraryCapabilities().songLists) return [];
  throwIfAborted(signal);
  const genres = dominantGenres(seedPool, FALLBACK_GENRES);
  const pools = await Promise.all(
    genres.map((genre) =>
      getRandomSongs({ genre, size: FALLBACK_GENRE_SIZE, musicFolderIds })
        .then((rsp) => rsp.songs?.song ?? [])
        .catch(() => []),
    ),
  );
  return pools.flat();
}

// Tracks by artists the similar tiers didn't name, within the default cap.
function fallbackCapacity(
  pool: readonly Child[],
  exclude: ReadonlySet<string>,
): number {
  const counts = new Map<string, number>();
  for (const track of pool) {
    const key = mixArtistKey(track);
    if (!exclude.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let capacity = 0;
  for (const count of counts.values()) {
    capacity += Math.min(count, MAX_PER_ARTIST);
  }
  return capacity;
}

// Closer neighbours get more room in the mix than the twelfth-closest one.
function capForRank(rank: number): number {
  if (rank < 4) return 4;
  if (rank < 8) return 3;
  return 2;
}

export async function generateArtistMix(
  seed: { id: string; name: string; musicBrainzId?: string },
  {
    musicFolderIds,
    rand,
    signal,
  }: { musicFolderIds?: string[]; rand: () => number; signal?: AbortSignal },
): Promise<GeneratedMix> {
  const [similar, seedPool] = await Promise.all([
    resolveMixArtists(seed, { musicFolderIds, signal }),
    artistPool(seed, 2, rand, signal),
  ]);

  const similarPools = await mapWithConcurrency(
    similar,
    POOL_CONCURRENCY,
    (artist) => artistPool(artist, 1, rand, signal),
  );
  const candidates = [...seedPool, ...similarPools.flat()];

  // How much of the mix the similar artists can fill on their own. Too little —
  // nobody similar, or a couple of artists with one album each — and the seed's
  // genres top it up, so the mix neither comes out a handful of tracks long nor
  // turns into the seed artist on repeat.
  const similarCapacity = similarPools.reduce(
    (sum, pool, rank) => sum + Math.min(pool.length, capForRank(rank)),
    0,
  );
  const fallback =
    similarCapacity < MIX_TARGET / 2
      ? await genreFallbackPool(seedPool, musicFolderIds, signal)
      : [];
  candidates.push(...fallback);

  // Keyed on the artists themselves rather than on every track in their pools:
  // a guest credited first on one of their albums is not who the cap is for.
  const artistCaps = new Map<string, number>();
  const setCap = (artist: MixArtist, cap: number) => {
    for (const key of mixArtistKeys(artist)) {
      if (!artistCaps.has(key)) artistCaps.set(key, cap);
    }
  };
  // Never more seed tracks than the rest of the mix can keep apart — counted
  // from what the genre top-up actually returned, which can be nothing.
  const namedKeys = new Set([seed, ...similar].flatMap(mixArtistKeys));
  const otherCapacity = similarCapacity + fallbackCapacity(fallback, namedKeys);
  setCap(
    seed,
    Math.min(
      Math.ceil(MIX_TARGET * SEED_SHARE),
      Math.floor(otherCapacity / MIN_SPACING),
    ),
  );
  for (const [rank, artist] of similar.entries()) {
    setCap(artist, capForRank(rank));
  }

  const tracks = curateMix(
    candidates,
    {
      target: MIX_TARGET,
      maxPerArtist: MAX_PER_ARTIST,
      maxPerAlbum: 3,
      minSpacing: MIN_SPACING,
      artistCaps,
    },
    rand,
  );

  const present = new Set(tracks.map(mixArtistKey));
  const featured = similar.filter((artist) =>
    mixArtistKeys(artist).some((key) => present.has(key)),
  );
  const featuredArtists = [
    ...featured.map((artist) => artist.name),
    ...topArtistNames(
      tracks,
      new Set([seed, ...featured].flatMap(mixArtistKeys)),
    ),
  ];
  return { tracks, featuredArtists };
}

/**
 * The most frequent artists in a mix, for mixes not built from a named list.
 * Counted and excluded by mixArtistKey, so a track crediting "Beyonce" still
 * counts as the "Beyoncé" the mix is named after.
 */
export function topArtistNames(
  tracks: readonly Child[],
  excludeKeys: ReadonlySet<string> = new Set(),
): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const track of tracks) {
    const name = track.artists?.[0]?.name ?? track.artist;
    const key = mixArtistKey(track);
    if (!name || excludeKeys.has(key)) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ name }) => name);
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new AbortedError();
}
