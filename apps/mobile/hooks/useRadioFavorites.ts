import { useCallback, useMemo } from "react";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useSyncServerFavorites } from "@/hooks/useServerFavoritesSync";
import type { InternetRadioStation } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import useRadioStations, {
  type FavoriteRadioStation,
  radioFavoritesForScope,
} from "@/stores/radioStations";

// Favorite radio stations visible for the active server: Radio-Browser
// favorites plus the "server"-sourced stations that belong to the current auth
// scope.
export function useScopedRadioFavorites(): FavoriteRadioStation[] {
  const scope = useCurrentAuthScope();
  const favorites = useRadioStations((s) => s.favoriteRadioStations);
  const radioBrowserEnabled = useApp((s) => s.radioBrowserEnabled);
  return useMemo(() => {
    const scoped = radioFavoritesForScope(favorites, scope);
    return radioBrowserEnabled
      ? scoped
      : scoped.filter((fav) => fav.source !== "radioBrowser");
  }, [favorites, scope, radioBrowserEnabled]);
}

const stationId = (station: InternetRadioStation) => station.id;
const favoriteId = (fav: FavoriteRadioStation) => fav.id;

// Keeps "server"-sourced radio favorites in sync with the active server's
// live internet-radio stations: patches name/url/homepage when they change and
// prunes favorites whose station was deleted on the server.
export function useSyncServerRadioFavorites() {
  const capabilities = useCapabilities();
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

  const reconcile = useCallback(
    (fav: FavoriteRadioStation, station: InternetRadioStation) => {
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
    },
    [updateFavoriteRadioStation],
  );

  useSyncServerFavorites({
    enabled: capabilities.internetRadio,
    isLoading,
    isError,
    live: data?.internetRadioStations?.internetRadioStation ?? [],
    liveId: stationId,
    favorites,
    favoriteId,
    remove: removeFavoriteRadioStation,
    reconcile,
  });
}
