import { useEffect } from "react";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import useRadioStations from "@/stores/radioStations";

// Keeps "server"-sourced radio favorites in sync with the active server's
// live internet-radio stations: patches name/url/homepage when they change and
// prunes favorites whose station was deleted on the server. Only reconciles
// favorites whose scope matches the active server, so the global favorites
// store never purges another server's favorites when you switch servers.
export function useSyncServerRadioFavorites() {
  const capabilities = useCapabilities();
  const scope = useCurrentAuthScope();
  const favorites = useRadioStations((s) => s.favoriteRadioStations);
  const removeFavoriteRadioStation = useRadioStations(
    (s) => s.removeFavoriteRadioStation,
  );
  const updateFavoriteRadioStation = useRadioStations(
    (s) => s.updateFavoriteRadioStation,
  );
  const { data, isLoading, isError } = useGetInternetRadioStations({
    enabled: capabilities.internetRadio,
  });

  useEffect(() => {
    if (!capabilities.internetRadio || isLoading || isError || !scope) return;
    const live = data?.internetRadioStations?.internetRadioStation ?? [];
    const byId = new Map(live.map((station) => [station.id, station]));
    for (const fav of favorites) {
      if (fav.source !== "server" || fav.scope !== scope) continue;
      const station = byId.get(fav.id);
      if (!station) {
        removeFavoriteRadioStation(fav.id);
        continue;
      }
      if (
        station.name !== fav.name ||
        station.streamUrl !== fav.streamUrl ||
        station.homePageUrl !== fav.homePageUrl
      ) {
        updateFavoriteRadioStation(fav.id, {
          name: station.name,
          streamUrl: station.streamUrl,
          homePageUrl: station.homePageUrl,
        });
      }
    }
  }, [
    data,
    favorites,
    scope,
    capabilities.internetRadio,
    isLoading,
    isError,
    removeFavoriteRadioStation,
    updateFavoriteRadioStation,
  ]);
}
