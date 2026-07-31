import { soulSyncRequest } from "@/services/soulsync";
import type { SoulSyncWatchlistArtist } from "@/services/soulsync/types";

interface WatchlistResponse {
  artists: SoulSyncWatchlistArtist[];
}

// provider -> the column SoulSync stores its artist id in. Order matters: it's
// the same lookup order the database uses when matching a bare id against every
// column, so an artist with more than one id resolves the way the server would.
const SOURCE_ID_FIELDS = {
  spotify: "spotify_artist_id",
  itunes: "itunes_artist_id",
  deezer: "deezer_artist_id",
  discogs: "discogs_artist_id",
  musicbrainz: "musicbrainz_artist_id",
  amazon: "amazon_artist_id",
} as const satisfies Record<string, keyof SoulSyncWatchlistArtist>;

// Every provider id a watchlist row carries. Usually one, but an artist that
// SoulSync has resolved across providers can hold several — and its DELETE and
// PATCH routes match a given id against all six columns, so any of them
// addresses the row.
export function watchlistArtistIds(artist: SoulSyncWatchlistArtist): string[] {
  const ids: string[] = [];
  for (const column of Object.values(SOURCE_ID_FIELDS)) {
    const value = artist[column];
    if (value) ids.push(value);
  }
  return ids;
}

// The id to address a watched artist by. A watchlist row carries no
// `artist_id` — it has one column per provider and fills only the ones it knows
// — so reading it means picking a populated column, preferring the one the
// row's `source` names.
export function watchlistArtistId(
  artist: SoulSyncWatchlistArtist,
): string | null {
  const field = artist.source
    ? SOURCE_ID_FIELDS[artist.source as keyof typeof SOURCE_ID_FIELDS]
    : undefined;
  return (field && artist[field]) || watchlistArtistIds(artist)[0] || null;
}

export async function fetchWatchlist(): Promise<SoulSyncWatchlistArtist[]> {
  const data = await soulSyncRequest<WatchlistResponse>("/watchlist");
  return data?.artists ?? [];
}

// `source` names the provider the id came from. It's optional server-side, but
// omitting it falls back to a shape guess that can't tell a numeric Deezer id
// from an iTunes one — always send the source the search result reported.
export async function addToWatchlist(artist: {
  artistId: string;
  artistName: string;
  source?: string;
}): Promise<void> {
  await soulSyncRequest<{ message: string }>("/watchlist", {
    method: "POST",
    data: {
      artist_id: artist.artistId,
      artist_name: artist.artistName,
      ...(artist.source ? { source: artist.source } : {}),
    },
  });
}

export async function removeFromWatchlist(artistId: string): Promise<void> {
  await soulSyncRequest<{ message: string }>(`/watchlist/${artistId}`, {
    method: "DELETE",
  });
}

// Kicks off a scan of watched artists for releases not yet in the library.
export async function scanWatchlist(): Promise<void> {
  await soulSyncRequest<{ message: string }>("/watchlist/scan", {
    method: "POST",
  });
}
