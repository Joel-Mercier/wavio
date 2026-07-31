import type { SoulSyncLibraryAlbum } from "@/services/soulsync/types";
import { useAuthBase } from "@/stores/auth";
import { artworkUrl } from "@/utils/artwork";

// SoulSync stores `thumb_url` exactly as its library scan read it off the media
// server, and no /api/v1 serializer normalises it — that only happens in the
// web UI, which rewrites the path against the media server's own base URL and
// token before rendering. So what the API hands us is a bare relative path:
//
//   navidrome  /rest/getCoverArt?id=<coverArt id>
//   jellyfin   /Items/<album id>/Images/Primary
//   plex       /library/metadata/<id>/thumb/<ts>
//
// The first two are ids in the same space as the server Wavio itself is signed
// into, so they can be resolved with the app's own credentials for free rather
// than fetched from SoulSync. `server_source` gates it: an id only means
// anything against the server it came from, so a SoulSync mirroring Plex — or
// simply a different server than the one the user is browsing — resolves to
// nothing and the row keeps its icon.
export function soulSyncAlbumArtworkUrl(
  album: SoulSyncLibraryAlbum,
  size?: number,
): string | undefined {
  const thumb = album.thumb_url;
  if (!thumb) return undefined;
  // Enrichment can overwrite the scanned path with a provider's own cover,
  // which is already fetchable as-is.
  if (/^https?:\/\//.test(thumb)) return thumb;

  const { serverType } = useAuthBase.getState();
  if (album.server_source === "navidrome") {
    if (serverType !== "navidrome" && serverType !== "opensubsonic") {
      return undefined;
    }
    const id = thumb.match(/[?&]id=([^&]+)/)?.[1];
    return id ? artworkUrl(decodeURIComponent(id), size) : undefined;
  }
  if (album.server_source === "jellyfin") {
    if (serverType !== "jellyfin") return undefined;
    const id = thumb.match(/^\/Items\/([^/]+)\//)?.[1];
    return id ? artworkUrl(id, size) : undefined;
  }
  return undefined;
}
