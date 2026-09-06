import { callRead } from "@/services/lastFm/client";
import { toCount, toEntries } from "@/services/lastFm/json";

/**
 * `track.getSimilar` and `artist.getSimilar`.
 *
 * Both are unsigned reads — `api_key` only — so they work whatever state the
 * session is in. `autocorrect=1` lets Last.fm fix a misspelt or aliased name
 * before matching, which matters because the names come from the user's own
 * tags rather than from Last.fm's catalogue.
 */

export type LastFmSimilarTrack = {
  name: string;
  artist: string;
  mbid?: string;
  durationMs?: number;
  /** 0–1, Last.fm's own confidence. Already sorted descending. */
  match: number;
};

export type LastFmSimilarArtist = {
  name: string;
  mbid?: string;
  match: number;
};

type RawSimilarTrack = {
  name?: string;
  mbid?: string;
  match?: string | number;
  duration?: string | number;
  artist?: { name?: string; "#text"?: string };
};

type RawSimilarArtist = {
  name?: string;
  mbid?: string;
  match?: string | number;
};

export const fetchSimilarTracks = async ({
  artist,
  track,
  mbid,
  limit,
  signal,
}: {
  artist?: string;
  track?: string;
  mbid?: string;
  limit: number;
  signal?: AbortSignal;
}): Promise<LastFmSimilarTrack[]> => {
  // An mbid identifies the recording outright; the name pair is the fallback.
  // Sending both makes Last.fm ignore the names, which is fine, but sending
  // neither is a request that can only fail.
  if (!mbid && !(artist && track)) return [];
  const rsp = await callRead<{
    similartracks?: { track?: RawSimilarTrack[] };
  }>(
    "track.getSimilar",
    mbid
      ? { mbid, limit, autocorrect: 1 }
      : { artist, track, limit, autocorrect: 1 },
    { signal },
  );
  return toEntries(rsp.similartracks?.track)
    .map((entry): LastFmSimilarTrack | null => {
      const name = entry.name?.trim();
      const entryArtist = (
        entry.artist?.name ?? entry.artist?.["#text"]
      )?.trim();
      if (!name || !entryArtist) return null;
      // `duration` is seconds here, unlike the milliseconds some other Last.fm
      // methods report.
      const seconds = toCount(entry.duration, 0);
      return {
        name,
        artist: entryArtist,
        mbid: entry.mbid?.trim() || undefined,
        durationMs: seconds > 0 ? seconds * 1000 : undefined,
        match: toCount(entry.match, 0),
      };
    })
    .filter((entry): entry is LastFmSimilarTrack => entry !== null);
};

export const fetchSimilarArtists = async ({
  artist,
  mbid,
  limit,
  signal,
}: {
  artist?: string;
  mbid?: string;
  limit: number;
  signal?: AbortSignal;
}): Promise<LastFmSimilarArtist[]> => {
  if (!mbid && !artist) return [];
  const rsp = await callRead<{
    similarartists?: { artist?: RawSimilarArtist[] };
  }>(
    "artist.getSimilar",
    mbid ? { mbid, limit, autocorrect: 1 } : { artist, limit, autocorrect: 1 },
    { signal },
  );
  return toEntries(rsp.similarartists?.artist)
    .map((entry): LastFmSimilarArtist | null => {
      const name = entry.name?.trim();
      if (!name) return null;
      return {
        name,
        mbid: entry.mbid?.trim() || undefined,
        match: toCount(entry.match, 0),
      };
    })
    .filter((entry): entry is LastFmSimilarArtist => entry !== null);
};
