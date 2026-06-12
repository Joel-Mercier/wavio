import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import createSelectors from "@/utils/createSelectors";

export type RadioStationSource = "server" | "radioBrowser";

export interface FavoriteRadioStation {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
  imageUrl?: string;
  tags?: string;
  country?: string;
  countrySubdivision?: string;
  languages?: string;
  // Where the station came from. "server" favorites are Subsonic/Navidrome
  // internet-radio stations; "radioBrowser" favorites come from the API.
  source: RadioStationSource;
  // Auth scope (getAuthScope) of the origin server for "server" favorites, so
  // we only sync/prune them against the server they belong to. Undefined for
  // "radioBrowser" favorites, which are server-independent.
  scope?: string;
  dateAdded: number;
  isFavorite: boolean;
}

// Normalized input accepted from the detail screen (which only carries route
// params), independent of the Radio-Browser DTO shape.
export type AddFavoriteRadioStationInput = Omit<
  FavoriteRadioStation,
  "dateAdded" | "isFavorite"
>;

// Favorites that belong to the given auth scope: server favorites from other
// accounts are excluded (their ids are server-assigned and can collide across
// servers), radioBrowser favorites are server-independent and always included.
export function radioFavoritesForScope(
  favorites: FavoriteRadioStation[],
  scope: string | null | undefined,
): FavoriteRadioStation[] {
  return favorites.filter(
    (fav) => fav.source !== "server" || fav.scope === scope,
  );
}

interface RadioStationsStore {
  favoriteRadioStations: FavoriteRadioStation[];
  addFavoriteRadioStation: (station: AddFavoriteRadioStationInput) => void;
  removeFavoriteRadioStation: (id: string) => void;
  updateFavoriteRadioStation: (
    id: string,
    patch: Partial<Omit<FavoriteRadioStation, "id" | "source">>,
  ) => void;
  clearFavoriteRadioStations: () => void;
}

export const useRadioStationsBase = create<RadioStationsStore>()(
  persist(
    (set) => ({
      favoriteRadioStations: [],
      addFavoriteRadioStation: (station: AddFavoriteRadioStationInput) => {
        set((state) => {
          if (
            state.favoriteRadioStations.some((fav) => fav.id === station.id)
          ) {
            return { favoriteRadioStations: state.favoriteRadioStations };
          }
          const favoriteRadioStation: FavoriteRadioStation = {
            ...station,
            isFavorite: true,
            dateAdded: Date.now(),
          };
          return {
            favoriteRadioStations: [
              favoriteRadioStation,
              ...state.favoriteRadioStations,
            ],
          };
        });
      },
      removeFavoriteRadioStation: (id: string) => {
        set((state) => ({
          favoriteRadioStations: state.favoriteRadioStations.filter(
            (fav) => fav.id !== id,
          ),
        }));
      },
      updateFavoriteRadioStation: (id, patch) => {
        set((state) => ({
          favoriteRadioStations: state.favoriteRadioStations.map((fav) =>
            fav.id === id ? { ...fav, ...patch } : fav,
          ),
        }));
      },
      clearFavoriteRadioStations: () => {
        set({ favoriteRadioStations: [] });
      },
    }),
    {
      name: "radioStations",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const useRadioStations = createSelectors(useRadioStationsBase);

export default useRadioStations;
