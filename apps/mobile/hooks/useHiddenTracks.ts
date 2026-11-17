import {
  blockedArtistKey,
  type HiddenMatchable,
  type HiddenReason,
  hiddenReason,
} from "@/services/hiddenTracks/match";
import { useAuthBase } from "@/stores/auth";
import useHiddenTracks from "@/stores/hiddenTracks";

// One primitive per row, like useIsTrackAvailableOffline: a hide redraws only
// the rows whose answer flipped. The server type is read through the hook, not
// at call time, so the React Compiler can't freeze a stale value.
export function useHiddenReason(
  track: HiddenMatchable | null | undefined,
): HiddenReason {
  const serverType = useAuthBase((state) => state.serverType);
  return useHiddenTracks((state) =>
    track ? hiddenReason(state, track, serverType) : null,
  );
}

export function useBlockedArtist(
  track: HiddenMatchable | null | undefined,
): { id: string; name?: string } | null {
  const serverType = useAuthBase((state) => state.serverType);
  const id = useHiddenTracks((state) =>
    track ? blockedArtistKey(state, track, serverType) : null,
  );
  const name = useHiddenTracks((state) =>
    id ? state.artists[id]?.name : undefined,
  );
  return id ? { id, name } : null;
}

export function useIsArtistBlocked(artistId: string | undefined): boolean {
  return useHiddenTracks((state) => !!artistId && artistId in state.artists);
}
