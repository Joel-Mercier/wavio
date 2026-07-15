import { useEffect } from "react";
import { useCurrentAuthScope } from "@/stores/auth";

// Shared reconciliation for "server"-sourced favorites (podcast channels,
// internet-radio stations): patches drifted metadata and prunes favorites whose
// live counterpart was deleted on the server. Only favorites whose scope
// matches the active server are touched, so the global favorites store never
// purges another server's favorites when you switch servers.
export function useSyncServerFavorites<
  TFav extends { source: string; scope?: string },
  TLive,
>({
  enabled,
  isLoading,
  isError,
  live,
  liveId,
  favorites,
  favoriteId,
  remove,
  reconcile,
}: {
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  live: TLive[];
  liveId: (item: TLive) => string;
  favorites: TFav[];
  favoriteId: (fav: TFav) => string;
  remove: (id: string) => void;
  // Patch the favorite when its live counterpart's metadata drifted.
  reconcile: (fav: TFav, item: TLive) => void;
}) {
  const scope = useCurrentAuthScope();

  useEffect(() => {
    if (!enabled || isLoading || isError || !scope) return;
    const byId = new Map(live.map((item) => [liveId(item), item]));
    for (const fav of favorites) {
      if (fav.source !== "server" || fav.scope !== scope) continue;
      const item = byId.get(favoriteId(fav));
      if (!item) {
        remove(favoriteId(fav));
        continue;
      }
      reconcile(fav, item);
    }
  }, [
    enabled,
    isLoading,
    isError,
    scope,
    live,
    liveId,
    favorites,
    favoriteId,
    remove,
    reconcile,
  ]);
}
