import {
  getSimilarSongs2,
  getSonicSimilarTracks,
} from "@/services/backend/browsing";
import type { Child } from "@/services/openSubsonic/types";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

// Resolve similar songs for a track, preferring the OpenSubsonic
// `sonicSimilarity` extension (audio-based similarity via a plugin such as
// AudioMuse-AI) when the active server advertises it, and falling back to the
// universally-supported getSimilarSongs2. The fallback also keeps older
// Navidrome and OpenSubsonic/Jellyfin servers working unchanged — and even on
// sonicSimilarity-capable servers, getSimilarSongs2 is overridden by the same
// plugin, so behaviour degrades gracefully if the extension call comes back
// empty or errors.
export async function fetchSimilarSongs(
  id: string,
  count?: number,
): Promise<Child[]> {
  const hasSonicSimilarity = useServerExtensionsBase
    .getState()
    .hasExtension("sonicSimilarity");

  if (hasSonicSimilarity) {
    try {
      const rsp = await getSonicSimilarTracks(id, { count });
      const songs =
        rsp.sonicSimilarTracks?.sonicMatch
          ?.map((match) => match.entry)
          .filter((entry): entry is Child => !!entry) ?? [];
      if (songs.length > 0) return songs;
    } catch {
      // Fall through to getSimilarSongs2 below.
    }
  }

  try {
    const rsp = await getSimilarSongs2(id, { count });
    return rsp.similarSongs2?.song ?? [];
  } catch {
    // Best-effort feature: the plugin backing getSimilarSongs2 (AudioMuse-AI on
    // Navidrome) can time out or be unavailable. Degrade to an empty list so the
    // UI shows an empty state instead of an error screen. Genuine failures are
    // still reported at the service chokepoint (subsonicEnvelope).
    return [];
  }
}
