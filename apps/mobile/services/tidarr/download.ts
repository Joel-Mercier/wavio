import { tidarrRequest } from "@/services/tidarr";
import type {
  TidalAlbum,
  TidalArtist,
  TidalTrack,
  TidarrItemType,
  TidarrQuality,
  TidarrQueueItem,
} from "@/services/tidarr/types";

const TIDAL_BASE_URL = "http://www.tidal.com";

// Tidarr hands the item's url straight to tiddl, which resolves the resource
// from the last path segment. The catalog usually supplies one; build it when
// it doesn't so a missing field can't produce an unqueueable item.
function resourceUrl(
  type: TidarrItemType,
  id: string | number,
  url?: string,
): string {
  return url || `${TIDAL_BASE_URL}/${type}/${id}`;
}

function primaryArtistName(
  artists: { name: string }[] | undefined,
  fallback = "",
): string {
  return artists?.[0]?.name || fallback;
}

// A null override means "whatever the instance is set to": tiddl only receives
// `-q` when the field is present, so leaving it out is how we defer.
function qualityFields(quality: TidarrQuality | null) {
  return quality ? { quality } : {};
}

export function albumQueueItem(
  album: TidalAlbum,
  quality: TidarrQuality | null,
): TidarrQueueItem {
  return {
    id: String(album.id),
    type: "album",
    title: album.title,
    artist: primaryArtistName(album.artists),
    ...qualityFields(quality),
    status: "queue_download",
    url: resourceUrl("album", album.id, album.url),
    loading: false,
    error: false,
  };
}

export function trackQueueItem(
  track: TidalTrack,
  quality: TidarrQuality | null,
): TidarrQueueItem {
  return {
    id: String(track.id),
    type: "track",
    title: track.title,
    artist: primaryArtistName(track.artists),
    ...qualityFields(quality),
    status: "queue_download",
    url: resourceUrl("track", track.id, track.url),
    loading: false,
    error: false,
  };
}

// Queued as a single `artist` item: Tidarr expands it into one queue entry per
// album server-side, honouring the instance's singles_filter.
export function artistQueueItem(
  artist: TidalArtist,
  quality: TidarrQuality | null,
): TidarrQueueItem {
  return {
    id: String(artist.id),
    type: "artist",
    title: artist.name,
    artist: artist.name,
    ...qualityFields(quality),
    status: "queue_download",
    url: resourceUrl("artist", artist.id, artist.url),
    loading: false,
    error: false,
  };
}

export async function enqueueItem(item: TidarrQueueItem): Promise<void> {
  await tidarrRequest<void>("/save", { method: "POST", data: { item } });
}
