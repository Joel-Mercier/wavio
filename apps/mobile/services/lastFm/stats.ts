import { callRead } from "@/services/lastFm/client";
import { type LastFmImage, pickImageUrl } from "@/services/lastFm/images";
import { toCount, toEntries } from "@/services/lastFm/json";
import type {
  LastFmPeriod,
  LastFmRecentTrack,
  LastFmUserInfo,
} from "@/services/lastFm/types";
import type { StatsResult, TopStatItem } from "@/services/scrobbling/stats";

// Matches ListenBrainz's TOP_STATS_COUNT: a glanceable top slice, not a
// browsable chart.
export const TOP_STATS_COUNT = 10;
export const RECENT_TRACKS_COUNT = 10;

/**
 * Every method here is an *unsigned* read: `api_key` and a username, no session
 * key and no signature. That is what makes the whole stats screen work for a
 * revoked session, and it is why none of them may ever move to `callSigned`.
 *
 * Last.fm computes these on read rather than in a batch job, so unlike
 * ListenBrainz there is no "not computed yet" state — every fetcher below wraps
 * its answer as `ready` so the shared StatsSection can render both.
 */
const ready = <T>(data: T): StatsResult<T> => ({
  state: "ready",
  data,
  lastUpdated: null,
});

type Attr = { rank?: string | number };

type RawTopArtist = {
  name?: string;
  mbid?: string;
  playcount?: string | number;
  "@attr"?: Attr;
};

type RawTopAlbum = {
  name?: string;
  mbid?: string;
  playcount?: string | number;
  artist?: { name?: string };
  image?: LastFmImage[];
  "@attr"?: Attr;
};

type RawTopTrack = RawTopAlbum & { duration?: string | number };

const rankOf = (raw: { "@attr"?: Attr }, index: number): number =>
  toCount(raw["@attr"]?.rank, index + 1);

export const fetchTopArtists = async ({
  userName,
  period,
  signal,
}: {
  userName: string;
  period: LastFmPeriod;
  signal?: AbortSignal;
}): Promise<StatsResult<TopStatItem[]>> => {
  const rsp = await callRead<{ topartists?: { artist?: RawTopArtist[] } }>(
    "user.getTopArtists",
    { user: userName, period, limit: TOP_STATS_COUNT },
    { signal },
  );
  return ready(
    toEntries(rsp.topartists?.artist)
      .filter((artist) => !!artist.name?.trim())
      .map((artist, index) => ({
        key: artist.mbid || `${artist.name}-${index}`,
        rank: rankOf(artist, index),
        title: artist.name as string,
        listenCount: toCount(artist.playcount, 0),
        // Deliberately no artwork: every Last.fm artist image is the same grey
        // placeholder, so a column of them is worse than none.
      })),
  );
};

export const fetchTopAlbums = async ({
  userName,
  period,
  signal,
}: {
  userName: string;
  period: LastFmPeriod;
  signal?: AbortSignal;
}): Promise<StatsResult<TopStatItem[]>> => {
  const rsp = await callRead<{ topalbums?: { album?: RawTopAlbum[] } }>(
    "user.getTopAlbums",
    { user: userName, period, limit: TOP_STATS_COUNT },
    { signal },
  );
  return ready(
    toEntries(rsp.topalbums?.album)
      .filter((album) => !!album.name?.trim())
      .map((album, index) => ({
        key: album.mbid || `${album.artist?.name}-${album.name}-${index}`,
        rank: rankOf(album, index),
        title: album.name as string,
        subtitle: album.artist?.name,
        listenCount: toCount(album.playcount, 0),
        artworkUrl: pickImageUrl(album.image),
      })),
  );
};

export const fetchTopTracks = async ({
  userName,
  period,
  signal,
}: {
  userName: string;
  period: LastFmPeriod;
  signal?: AbortSignal;
}): Promise<StatsResult<TopStatItem[]>> => {
  const rsp = await callRead<{ toptracks?: { track?: RawTopTrack[] } }>(
    "user.getTopTracks",
    { user: userName, period, limit: TOP_STATS_COUNT },
    { signal },
  );
  return ready(
    toEntries(rsp.toptracks?.track)
      .filter((track) => !!track.name?.trim())
      .map((track, index) => ({
        key: track.mbid || `${track.artist?.name}-${track.name}-${index}`,
        rank: rankOf(track, index),
        title: track.name as string,
        subtitle: track.artist?.name,
        listenCount: toCount(track.playcount, 0),
        artworkUrl: pickImageUrl(track.image),
      })),
  );
};

type RawUserInfo = {
  user?: {
    name?: string;
    playcount?: string | number;
    artist_count?: string | number;
    album_count?: string | number;
    track_count?: string | number;
    url?: string;
    // `unixtime` is a string and `#text` a number on the same object, and which
    // of the two is present has changed over the years.
    registered?: { unixtime?: string | number; "#text"?: string | number };
  };
};

export const fetchUserInfo = async ({
  userName,
  signal,
}: {
  userName: string;
  signal?: AbortSignal;
}): Promise<LastFmUserInfo> => {
  const rsp = await callRead<RawUserInfo>(
    "user.getInfo",
    { user: userName },
    { signal },
  );
  const user = rsp.user ?? {};
  const registered = toCount(
    user.registered?.unixtime ?? user.registered?.["#text"],
    0,
  );
  return {
    name: user.name?.trim() || userName,
    playCount: toCount(user.playcount, 0),
    artistCount: toCount(user.artist_count, 0),
    albumCount: toCount(user.album_count, 0),
    trackCount: toCount(user.track_count, 0),
    registeredAt: registered > 0 ? registered : null,
    url: user.url,
  };
};

type RawRecentTrack = {
  name?: string;
  mbid?: string;
  loved?: string | number;
  // With `extended=1` the artist is an object with a `name`; without it, the
  // name lives in `#text`. Both are read so the shape can't silently break the
  // list if the flag is ever dropped.
  artist?: { name?: string; "#text"?: string };
  album?: { "#text"?: string };
  image?: LastFmImage[];
  date?: { uts?: string };
  "@attr"?: { nowplaying?: string | boolean };
};

export const fetchRecentTracks = async ({
  userName,
  limit = RECENT_TRACKS_COUNT,
  signal,
}: {
  userName: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<StatsResult<LastFmRecentTrack[]>> => {
  const rsp = await callRead<{ recenttracks?: { track?: RawRecentTrack[] } }>(
    "user.getRecentTracks",
    // `extended=1` is what puts the `loved` flag on each row; without it the
    // heart would need one track.getInfo per entry.
    { user: userName, limit, extended: 1 },
    { signal },
  );
  return ready(
    toEntries(rsp.recenttracks?.track)
      .map((track, index): LastFmRecentTrack | null => {
        const name = track.name?.trim();
        const artist = (track.artist?.name ?? track.artist?.["#text"])?.trim();
        if (!name || !artist) return null;
        const uts = Number(track.date?.uts);
        return {
          // The same track can appear twice in one page (a song on repeat), so
          // the timestamp and position both go into the key.
          key: `${track.mbid || name}-${track.date?.uts ?? "now"}-${index}`,
          name,
          artist,
          album: track.album?.["#text"]?.trim() || undefined,
          artworkUrl: pickImageUrl(track.image),
          loved: String(track.loved) === "1",
          nowPlaying: String(track["@attr"]?.nowplaying) === "true",
          playedAt: Number.isFinite(uts) && uts > 0 ? uts : null,
        };
      })
      .filter((track): track is LastFmRecentTrack => track !== null),
  );
};
