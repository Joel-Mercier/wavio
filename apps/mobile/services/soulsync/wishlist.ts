import { soulSyncRequest } from "@/services/soulsync";
import type {
  SoulSyncTrack,
  SoulSyncWishlistTrack,
} from "@/services/soulsync/types";

interface WishlistResponse {
  tracks: SoulSyncWishlistTrack[];
}

// SoulSync stores the wishlist payload as an opaque Spotify-shaped blob, while
// /search/* answers in a flat shape — so a result can't be forwarded as-is.
//
// `album` MUST be an object. A plain string fails `isinstance(album, dict)` on
// the way in and is replaced with the *track* name, which then feeds the
// artist + album + title query the download worker generates ("dire straits
// sultans of swing sultans of swing") and wrecks matching. `artists` is the
// opposite: flat strings are read back correctly, so they're left alone.
export function toWishlistTrackData(track: SoulSyncTrack) {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists ?? [],
    album: {
      name: track.album || track.name,
      images: track.image_url ? [{ url: track.image_url }] : [],
    },
    duration_ms: track.duration_ms ?? 0,
    popularity: track.popularity ?? 0,
  };
}

export async function fetchWishlist(): Promise<SoulSyncWishlistTrack[]> {
  const data = await soulSyncRequest<WishlistResponse>("/wishlist");
  return data?.tracks ?? [];
}

// The cover the row was created with. /downloads exposes no artwork of its own,
// so an in-flight track's art has to come from here — which works because a
// track stays on the wishlist until it downloads successfully.
export function wishlistArtworkUrl(
  row: SoulSyncWishlistTrack,
): string | undefined {
  return row.track_data?.album?.images?.[0]?.url ?? undefined;
}

export async function addToWishlist(track: SoulSyncTrack): Promise<void> {
  await soulSyncRequest<{ message: string }>("/wishlist", {
    method: "POST",
    data: {
      track_data: toWishlistTrackData(track),
      source_type: "api",
      failure_reason: "Requested from Wavio",
    },
  });
}

export async function removeFromWishlist(trackId: string): Promise<void> {
  await soulSyncRequest<{ message: string }>(`/wishlist/${trackId}`, {
    method: "DELETE",
  });
}

// Starts a download batch for specific wishlist entries. `track_ids` isn't
// documented on /api/v1, but the v1 handler calls the WebUI's route function
// directly and that reads the JSON body off the *current* request — so our body
// reaches it. Without it the call would process the entire wishlist.
//
// The same indirection means the inner handler's response is discarded, so a
// 200 here does NOT prove processing began; only the queue does.
export async function processWishlist(trackIds: string[]): Promise<void> {
  await soulSyncRequest<{ message: string }>("/wishlist/process", {
    method: "POST",
    data: { track_ids: trackIds },
  });
}

// Acquiring a track is add-then-process: the wishlist row is the durable
// intent, the batch is what acts on it. This replaces POST /request, which
// hands a raw string to a pipeline that does no query cleaning, isn't tracked
// in /downloads, and skips post-processing so the file never reaches the
// library.
export async function requestTrack(track: SoulSyncTrack): Promise<void> {
  await addToWishlist(track);
  await processWishlist([track.id]);
}
