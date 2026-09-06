import { callRead } from "@/services/lastFm/client";
import { toCount, toEntries } from "@/services/lastFm/json";
import type { LastFmLovedTrack, LastFmPage } from "@/services/lastFm/types";

// The documented maximum for a `user.*` page.
export const LOVED_TRACKS_PAGE_SIZE = 50;

type RawLovedTrack = {
  name?: string;
  mbid?: string;
  url?: string;
  artist?: { name?: string };
  date?: { uts?: string };
};

type LovedTracksResponse = {
  lovedtracks?: {
    track?: RawLovedTrack | RawLovedTrack[];
    "@attr"?: {
      page?: string | number;
      totalPages?: string | number;
      total?: string | number;
    };
  };
};

const toLovedTrack = (raw: RawLovedTrack): LastFmLovedTrack | null => {
  const name = raw.name?.trim();
  const artist = raw.artist?.name?.trim();
  // Neither half is optional: a loved track with no artist can't be searched
  // for, let alone matched, so it is dropped rather than carried as a row that
  // will always read "not in your library".
  if (!name || !artist) return null;
  const uts = Number(raw.date?.uts);
  return {
    name,
    artist,
    mbid: raw.mbid?.trim() || undefined,
    lovedAt: Number.isFinite(uts) && uts > 0 ? uts : undefined,
    url: raw.url,
  };
};

/**
 * One page of the user's loved tracks, newest first.
 *
 * An unsigned read: `user.getLovedTracks` takes `api_key` and a username alone,
 * so it works for any public profile and must never be handed the session key.
 */
export const fetchLovedTracks = async ({
  userName,
  page = 1,
  limit = LOVED_TRACKS_PAGE_SIZE,
  signal,
}: {
  userName: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<LastFmPage<LastFmLovedTrack>> => {
  const rsp = await callRead<LovedTracksResponse>(
    "user.getLovedTracks",
    { user: userName, page, limit },
    { signal },
  );
  const items = toEntries(rsp.lovedtracks?.track)
    .map(toLovedTrack)
    .filter((track): track is LastFmLovedTrack => track !== null);
  const attr = rsp.lovedtracks?.["@attr"];
  return {
    items,
    page: toCount(attr?.page, page),
    totalPages: toCount(attr?.totalPages, 1),
    total: toCount(attr?.total, items.length),
  };
};
