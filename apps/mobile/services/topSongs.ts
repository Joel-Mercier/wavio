import { getTopSongs } from "@/services/backend/browsing";
import { getCapabilities } from "@/services/backend/capabilities";
import type { Child } from "@/services/openSubsonic/types";
import { useAuthBase } from "@/stores/auth";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

// Whether the active server can resolve top songs from an artist id. Two
// sources: a static per-backend floor (Jellyfin, local library) and the
// OpenSubsonic `topSongsByArtistId` extension, which Navidrome advertises from
// 0.64 and any other OpenSubsonic server may too.
export function supportsTopSongsById(): boolean {
  return (
    getCapabilities(useAuthBase.getState().serverType).topSongsByArtistId ||
    useServerExtensionsBase.getState().hasExtension("topSongsByArtistId")
  );
}

// Resolve an artist's top songs by id where the server supports it, falling
// back to the display name everywhere else. The id path is both faster (callers
// hold the id up front, so they skip the getArtist round-trip a name costs) and
// exact — Navidrome's name lookup is a `LIKE ... LIMIT 1`, so two artists
// sharing a name, or a name containing a `%`/`_`, can resolve to the wrong one.
//
// Callers may pass both — the id path ignores the name, so a name arriving late
// never changes the request that goes out.
//
// Errors propagate — the artist screen surfaces them; callers that degrade
// silently do their own catching.
export async function fetchTopSongs({
  id,
  name,
  count,
}: {
  id?: string;
  name?: string;
  count?: number;
}): Promise<Child[]> {
  if (id && supportsTopSongsById()) {
    const rsp = await getTopSongs("", { count, id });
    return rsp.topSongs?.song ?? [];
  }
  // An id the server can't resolve and no name leaves nothing to ask for — a
  // request here would just be error 10 (missing parameter).
  if (!name) return [];
  const rsp = await getTopSongs(name, { count });
  return rsp.topSongs?.song ?? [];
}
