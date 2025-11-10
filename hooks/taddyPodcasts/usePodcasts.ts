import {
  getLatestPodcastEpisodes,
  getMultiplePodcastEpisodes,
  getMultiplePodcastSeries,
  getPodcastSeries,
  getPopularContent,
  getTopChartsByCountry,
  getTopChartsByGenres,
  search,
} from "@/services/taddyPodcasts/podcasts";
import type {
  Country,
  Genre,
  Language,
  PodcastContentType,
  SearchContentType,
  SearchMatchType,
  SearchSortOrder,
  SortOrder,
  TaddyType,
} from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { useQuery } from "@tanstack/react-query";

export const usePodcastSeries = ({
  uuid,
  itunesId,
  rssUrl,
  name,
  page,
  limitPerPage,
  sortOrder,
  searchTerm,
}: {
  uuid?: string;
  itunesId?: number;
  rssUrl?: string;
  name?: string;
  page?: number;
  limitPerPage?: number;
  sortOrder?: keyof typeof SortOrder;
  searchTerm?: string;
}) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: [
      "taddyPodcasts:getPodcastSeries",
      uuid,
      itunesId,
      rssUrl,
      name,
      page,
      limitPerPage,
      sortOrder,
      searchTerm,
    ],
    queryFn: async () => {
      const response = await getPodcastSeries({
        uuid,
        itunesId,
        rssUrl,
        name,
        page,
        limitPerPage,
        sortOrder,
        searchTerm,
      });

      if (response.data?.getPodcastSeries) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        const isFavorite = favoriteUuids.has(
          response.data.getPodcastSeries.uuid
        );
        response.data.getPodcastSeries.isFavorite = isFavorite;
        for (const episode of response.data.getPodcastSeries.episodes) {
          episode.podcastSeries.isFavorite = isFavorite;
        }
      }

      return response;
    },
  });
};

export const useLatestPodcastEpisodes = (uuids: string[]) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: ["taddyPodcasts:getLatestPodcastEpisodes", uuids],
    queryFn: async () => {
      const response = await getLatestPodcastEpisodes(uuids);
      if (response.data?.getLatestPodcastEpisodes) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const episode of response.data.getLatestPodcastEpisodes) {
          episode.podcastSeries.isFavorite = favoriteUuids.has(episode.podcastSeries.uuid);
        };
      }
      return response;
    },
  });
};

export const useMultiplePodcastEpisodes = (uuids: string[]) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: ["taddyPodcasts:getMultiplePodcastEpisodes", uuids],
    queryFn: async () => {
      const response = await getMultiplePodcastEpisodes(uuids);
      if (response.data?.getMultiplePodcastEpisodes) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const episode of response.data.getMultiplePodcastEpisodes) {
          episode.podcastSeries.isFavorite = favoriteUuids.has(episode.podcastSeries.uuid);
        };
      }
    },
  });
};

export const useMultiplePodcastSeries = (uuids: string[]) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: ["taddyPodcasts:getMultiplePodcastSeries", uuids],
    queryFn: async () => {
      const response = await getMultiplePodcastSeries(uuids);
      if (response.data?.getMultiplePodcastSeries) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastSeries of response.data.getMultiplePodcastSeries) {
          podcastSeries.isFavorite = favoriteUuids.has(podcastSeries.uuid);
        }
      }
    },
  });
};

export const useTopChartsByCountry = ({
  type,
  country,
  page,
  limitPerPage,
}: {
  type: keyof typeof TaddyType;
  country?: keyof typeof Country;
  page?: number;
  limitPerPage?: number;
}) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: [
      "taddyPodcasts:getTopChartsByCountry",
      type,
      country,
      page,
      limitPerPage,
    ],
    queryFn: async () => {
      const response = await getTopChartsByCountry({ type, country, page, limitPerPage });
      if (response.data?.getTopChartsByCountry?.podcastSeries) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastSeries of response.data.getTopChartsByCountry.podcastSeries) {
          podcastSeries.isFavorite = favoriteUuids.has(podcastSeries.uuid);
        };
      }
      if (response.data?.getTopChartsByCountry?.podcastEpisodes) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastEpisode of response.data.getTopChartsByCountry.podcastEpisodes) {
          podcastEpisode.podcastSeries.isFavorite = favoriteUuids.has(podcastEpisode.podcastSeries.uuid);
        };
      }
      return response;
    },
  });
};

export const useTopChartsByGenres = ({
  type,
  genres,
  country,
  page,
  limitPerPage,
}: {
  type: keyof typeof TaddyType;
  genres?: (keyof typeof Genre)[];
  country?: keyof typeof Country;
  page?: number;
  limitPerPage?: number;
}) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: [
      "taddyPodcasts:getTopChartsByGenres",
      type,
      genres,
      country,
      page,
      limitPerPage,
    ],
    queryFn: async () => {
      const response = await getTopChartsByGenres({
        type,
        genres,
        country,
        page,
        limitPerPage,
      });
      if (response.data?.getTopChartsByGenres?.podcastSeries) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastSeries of response.data.getTopChartsByGenres.podcastSeries) {
          podcastSeries.isFavorite = favoriteUuids.has(podcastSeries.uuid);
        };
      }
      if (response.data?.getTopChartsByGenres?.podcastEpisodes) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastEpisode of response.data.getTopChartsByGenres.podcastEpisodes) {
          podcastEpisode.podcastSeries.isFavorite = favoriteUuids.has(podcastEpisode.podcastSeries.uuid);
        };
      }
      return response;
    },
    enabled: !!genres
  });
};

export const usePopularContent = ({
  language,
  genres,
  page,
  limitPerPage,
}: {
  language?: keyof typeof Language;
  genres?: keyof (typeof Genre)[];
  page?: number;
  limitPerPage?: number;
}) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: [
      "taddyPodcasts:getPopularContent",
      language,
      genres,
      page,
      limitPerPage,
    ],
    queryFn: async () => {
      const response = await getPopularContent({ language, genres, page, limitPerPage });
      if (response.data?.getPopularContent?.podcastSeries) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        for (const podcastSeries of response.data.getPopularContent.podcastSeries) {
          podcastSeries.isFavorite = favoriteUuids.has(podcastSeries.uuid);
        };
      }
    },
  });
};

export const useSearchPodcasts = ({
  searchTerm,
  page,
  limitPerPage,
  filterForTypes,
  filterForCountries,
  filterForLanguages,
  filterForGenres,
  filterForSeriesUuids,
  filterForNotInSeriesUuids,
  filterForPodcastContentType,
  filterForPublishedAfter,
  filterForPublishedBefore,
  filterForLastUpdatedAfter,
  filterForLastUpdatedBefore,
  filterForTotalEpisodesLessThan,
  filterForTotalEpisodesGreaterThan,
  filterForDurationLessThan,
  filterForDurationGreaterThan,
  filterForHasTranscript,
  sortBy,
  matchBy,
  isSafeMode,
}: {
  searchTerm: string;
  page?: number;
  limitPerPage?: number;
  filterForTypes?: (keyof typeof SearchContentType)[];
  filterForCountries?: (keyof typeof Country)[];
  filterForLanguages?: (keyof typeof Language)[];
  filterForGenres?: (keyof typeof Genre)[];
  filterForSeriesUuids?: string[];
  filterForNotInSeriesUuids?: string[];
  filterForPodcastContentType?: (keyof typeof PodcastContentType)[];
  filterForPublishedAfter?: number;
  filterForPublishedBefore?: number;
  filterForLastUpdatedAfter?: number;
  filterForLastUpdatedBefore?: number;
  filterForTotalEpisodesLessThan?: number;
  filterForTotalEpisodesGreaterThan?: number;
  filterForDurationLessThan?: number;
  filterForDurationGreaterThan?: number;
  filterForHasTranscript?: boolean;
  sortBy?: keyof typeof SearchSortOrder;
  matchBy?: keyof typeof SearchMatchType;
  isSafeMode?: boolean;
}) => {
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  return useQuery({
    queryKey: [
      "taddyPodcasts:search",
      searchTerm,
      page,
      limitPerPage,
      filterForTypes,
      filterForCountries,
      filterForLanguages,
      filterForGenres,
      filterForSeriesUuids,
      filterForNotInSeriesUuids,
      filterForPodcastContentType,
      filterForPublishedAfter,
      filterForPublishedBefore,
      filterForLastUpdatedAfter,
      filterForLastUpdatedBefore,
      filterForTotalEpisodesLessThan,
      filterForTotalEpisodesGreaterThan,
      filterForDurationLessThan,
      filterForDurationGreaterThan,
      filterForHasTranscript,
      sortBy,
      matchBy,
      isSafeMode,
    ],
    queryFn: async () => {
      const response = await search({
        searchTerm,
        page,
        limitPerPage,
        filterForTypes,
        filterForCountries,
        filterForLanguages,
        filterForGenres,
        filterForSeriesUuids,
        filterForNotInSeriesUuids,
        filterForPodcastContentType,
        filterForPublishedAfter,
        filterForPublishedBefore,
        filterForLastUpdatedAfter,
        filterForLastUpdatedBefore,
        filterForTotalEpisodesLessThan,
        filterForTotalEpisodesGreaterThan,
        filterForDurationLessThan,
        filterForDurationGreaterThan,
        filterForHasTranscript,
        sortBy,
        matchBy,
        isSafeMode,
      });
      if (response.data?.search) {
        const favoriteUuids = new Set(favoritePodcasts.map(fav => fav.uuid));
        if (response.data.search.podcastSeries && response.data.search.podcastSeries.length > 0) {
          for (const podcastSeries of response.data.search.podcastSeries) {
            podcastSeries.isFavorite = favoriteUuids.has(podcastSeries.uuid);
          };
        }
        if (response.data.search.podcastEpisodes && response.data.search.podcastEpisodes.length > 0) {
          for (const podcastEpisode of response.data.search.podcastEpisodes) {
            podcastEpisode.podcastSeries.isFavorite = favoriteUuids.has(podcastEpisode.podcastSeries.uuid);
          };
        }
      }
      return response;
    },
    enabled: !!searchTerm
  });
};
