import { soulSyncRequest } from "@/services/soulsync";
import type {
  SoulSyncArtist,
  SoulSyncSearchResults,
  SoulSyncTrack,
} from "@/services/soulsync/types";

const DEFAULT_LIMIT = 20;

interface TracksResponse {
  tracks: SoulSyncTrack[];
  source: string;
}
interface ArtistsResponse {
  artists: SoulSyncArtist[];
  source: string;
}

// SoulSync splits search across separate POST endpoints (no unified /search
// like Lidarr's), so one user query fans out and is merged here.
//
// /search/albums is deliberately NOT called: SoulSync's public API has no
// album-level acquisition, so an album result would be a dead end, and the API
// allows only 60 requests/minute across every endpoint. Add it back alongside
// album downloads.
//
// The two calls are independent — a provider that fails for one kind shouldn't
// blank the other, so each settles on its own and an empty list stands in for a
// failure. Both failing is a different thing entirely (bad API key, rate limit,
// instance down) and is rethrown: reporting it as an empty result would render
// a confident "no results" and cache it for the query's whole staleTime.
export async function search(
  term: string,
  limit = DEFAULT_LIMIT,
): Promise<SoulSyncSearchResults> {
  const body = { query: term, limit };
  const [tracks, artists] = await Promise.allSettled([
    soulSyncRequest<TracksResponse>("/search/tracks", {
      method: "POST",
      data: body,
    }),
    soulSyncRequest<ArtistsResponse>("/search/artists", {
      method: "POST",
      data: body,
    }),
  ]);

  if (tracks.status === "rejected" && artists.status === "rejected") {
    throw tracks.reason;
  }

  return {
    tracks: tracks.status === "fulfilled" ? (tracks.value?.tracks ?? []) : [],
    artists:
      artists.status === "fulfilled" ? (artists.value?.artists ?? []) : [],
    trackSource: tracks.status === "fulfilled" ? tracks.value?.source : "",
    artistSource: artists.status === "fulfilled" ? artists.value?.source : "",
  };
}
