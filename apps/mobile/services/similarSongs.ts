import {
  getSimilarSongs2,
  getSonicSimilarTracks,
} from "@/services/backend/browsing";
import {
  fetchLastFmSimilarSongs,
  type LastFmSeed,
} from "@/services/lastFm/recommendations";
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
//
// Last.fm is the last tier, and only when the user has connected an account. It
// is what a plain Subsonic server or a local library has instead of nothing:
// those backends have no similarity of their own, so their getSimilarSongs2
// returns an empty list and endless radio falls back to the seed artist's own
// top songs, which is a much narrower thing than "music like this".
export async function fetchSimilarSongs(
  id: string,
  count?: number,
  seed?: LastFmSeed,
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
    const songs = rsp.similarSongs2?.song ?? [];
    if (songs.length > 0) return songs;
  } catch {
    // Best-effort feature: the plugin backing getSimilarSongs2 (AudioMuse-AI on
    // Navidrome) can time out or be unavailable. Fall through rather than
    // failing — genuine failures are still reported at the service chokepoint
    // (subsonicEnvelope).
  }

  try {
    return await fetchLastFmSimilarSongs(seed, { count });
  } catch {
    // Degrade to an empty list so the UI shows an empty state instead of an
    // error screen.
    return [];
  }
}
