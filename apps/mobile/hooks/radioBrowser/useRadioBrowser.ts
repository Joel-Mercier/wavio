import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getCountries,
  getLanguages,
  getPopularStations,
  getStationsByCountryCode,
  getStationsByTag,
  getTags,
  getTopVotedStations,
  searchStations,
} from "@/services/radioBrowser/stations";
import type { RadioBrowserStation } from "@/services/radioBrowser/types";
import useApp from "@/stores/app";
import useRadioStations from "@/stores/radioStations";

// Lookup lists rarely change; cache them for the session.
const LOOKUP_STALE_TIME = 1000 * 60 * 60;

const hydrate = (
  stations: RadioBrowserStation[],
  favoriteIds: Set<string>,
): RadioBrowserStation[] =>
  stations.map((station) => ({
    ...station,
    isFavorite: favoriteIds.has(station.stationuuid),
  }));

export const useTopVotedStations = ({
  limit = 20,
}: {
  limit?: number;
} = {}) => {
  const favorites = useRadioStations((store) => store.favoriteRadioStations);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:topVoted", limit],
    queryFn: async () => {
      const stations = await getTopVotedStations({ limit });
      return hydrate(stations, new Set(favorites.map((fav) => fav.id)));
    },
    enabled: radioBrowserEnabled,
  });
};

export const usePopularStations = ({ limit = 20 }: { limit?: number } = {}) => {
  const favorites = useRadioStations((store) => store.favoriteRadioStations);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:popular", limit],
    queryFn: async () => {
      const stations = await getPopularStations({ limit });
      return hydrate(stations, new Set(favorites.map((fav) => fav.id)));
    },
    enabled: radioBrowserEnabled,
  });
};

export const useStationsByCountryCode = ({
  countryCode,
  limit = 20,
}: {
  countryCode?: string;
  limit?: number;
}) => {
  const favorites = useRadioStations((store) => store.favoriteRadioStations);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:byCountryCode", countryCode, limit],
    queryFn: async () => {
      const stations = await getStationsByCountryCode(countryCode as string, {
        limit,
      });
      return hydrate(stations, new Set(favorites.map((fav) => fav.id)));
    },
    enabled: radioBrowserEnabled && !!countryCode,
  });
};

export const useStationsByTag = ({
  tag,
  limit = 20,
}: {
  tag: string;
  limit?: number;
}) => {
  const favorites = useRadioStations((store) => store.favoriteRadioStations);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:byTag", tag, limit],
    queryFn: async () => {
      const stations = await getStationsByTag(tag, { limit });
      return hydrate(stations, new Set(favorites.map((fav) => fav.id)));
    },
    enabled: radioBrowserEnabled && !!tag,
  });
};

export const useInfiniteSearchStations = ({
  name,
  tags,
  countryCode,
  language,
  limit = 25,
}: {
  name: string;
  tags?: string[];
  countryCode?: string;
  language?: string;
  limit?: number;
}) => {
  const favorites = useRadioStations((store) => store.favoriteRadioStations);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  const tagList = tags && tags.length > 0 ? tags.join(",") : undefined;
  const enabled =
    radioBrowserEnabled && !!(name || tagList || countryCode || language);
  return useInfiniteQuery({
    queryKey: [
      "radioBrowser:search:infinite",
      name,
      tagList,
      countryCode,
      language,
      limit,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const stations = await searchStations({
        name: name || undefined,
        tagList,
        countrycode: countryCode,
        language,
        order: "votes",
        reverse: true,
        limit,
        offset: pageParam,
      });
      return hydrate(stations, new Set(favorites.map((fav) => fav.id)));
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < limit) {
        return undefined;
      }
      return allPages.length * limit;
    },
    enabled,
  });
};

export const useRadioTags = ({ limit = 200 }: { limit?: number } = {}) => {
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:tags", limit],
    queryFn: () => getTags({ limit }),
    staleTime: LOOKUP_STALE_TIME,
    enabled: radioBrowserEnabled,
  });
};

export const useRadioCountries = () => {
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:countries"],
    queryFn: getCountries,
    staleTime: LOOKUP_STALE_TIME,
    enabled: radioBrowserEnabled,
  });
};

export const useRadioLanguages = () => {
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  return useQuery({
    queryKey: ["radioBrowser:languages"],
    queryFn: getLanguages,
    staleTime: LOOKUP_STALE_TIME,
    enabled: radioBrowserEnabled,
  });
};
