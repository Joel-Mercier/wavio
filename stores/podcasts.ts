import { zustandStorage } from "@/config/storage";
import type {
  Country,
  Genre,
  Language,
  PodcastSeries,
} from "@/services/taddyPodcasts/types";
import createSelectors from "@/utils/createSelectors";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface FavoritePodcast {
  uuid: string;
  name: string;
  genres: (keyof typeof Genre)[];
  language: keyof typeof Language;
  country: keyof typeof Country;
  imageUrl: string;
  authorName: string;
  dateAdded: number;
  isFavorite: boolean;
}

export interface RecommendationParams {
  genres?: (keyof typeof Genre)[];
  language?: keyof typeof Language;
  country?: keyof typeof Country;
  excludeUuids?: string[];
}

interface PodcastsStore {
  taddyPodcastsApiKey: string;
  taddyPodcastsUserId: string;
  taddyPodcastsLanguage: keyof typeof Language;
  taddyPodcastsCountry: keyof typeof Country;
  setTaddyPodcastsConfig: ({
    apiKey,
    userId,
    language,
    country,
  }: {
    apiKey: string;
    userId: string;
    language: keyof typeof Language;
    country: keyof typeof Country;
  }) => void;
  clearTaddyPodcastsConfig: () => void;
  favoritePodcasts: FavoritePodcast[];
  addFavoritePodcast: (podcast: PodcastSeries) => void;
  removeFavoritePodcast: (uuid: string) => void;
  clearFavoritePodcasts: () => void;
  getRecommendationParams: () => RecommendationParams;
  getGenreRotation: () => (keyof typeof Genre)[];
  lastUsedGenreIndex: number;
  setLastUsedGenreIndex: (index: number) => void;
}

export const usePodcastsBase = create<PodcastsStore>()(
  persist(
    (set, get) => ({
      taddyPodcastsApiKey: "",
      taddyPodcastsUserId: "",
      taddyPodcastsLanguage: "ENGLISH",
      taddyPodcastsCountry: "UNITED_STATES_OF_AMERICA",
      setTaddyPodcastsConfig: ({ apiKey, userId, language, country }) => {
        set({
          taddyPodcastsApiKey: apiKey,
          taddyPodcastsUserId: userId,
          taddyPodcastsLanguage: language,
          taddyPodcastsCountry: country,
        });
      },
      clearTaddyPodcastsConfig: () => {
        set({ taddyPodcastsApiKey: "", taddyPodcastsUserId: "" });
      },
      favoritePodcasts: [],
      addFavoritePodcast: (podcast: PodcastSeries) => {
        set((state) => {
          if (state.favoritePodcasts.some((fav) => fav.uuid === podcast.uuid)) {
            return { favoritePodcasts: state.favoritePodcasts };
          }
          const favoritePodcast: FavoritePodcast = {
            uuid: podcast.uuid,
            name: podcast.name,
            genres: podcast.genres,
            language: podcast.language,
            country: podcast.itunesInfo?.country || state.taddyPodcastsCountry,
            imageUrl: podcast.imageUrl,
            authorName: podcast.authorName,
            isFavorite: true,
            dateAdded: Date.now(),
          };
          const newFavoritePodcasts = [
            favoritePodcast,
            ...state.favoritePodcasts,
          ];
          return { favoritePodcasts: newFavoritePodcasts };
        });
      },
      removeFavoritePodcast: (uuid: string) => {
        set((state) => {
          const withoutPodcast = state.favoritePodcasts.filter(
            (fav) => fav.uuid !== uuid,
          );
          return { favoritePodcasts: withoutPodcast };
        });
      },
      clearFavoritePodcasts: () => {
        set({ favoritePodcasts: [] });
      },
      lastUsedGenreIndex: 0,
      setLastUsedGenreIndex: (index: number) => {
        set({ lastUsedGenreIndex: index });
      },
      getGenreRotation: () => {
        const state = get();
        const allGenres = state.favoritePodcasts.flatMap(
          (podcast) => podcast.genres,
        );
        const uniqueGenres = [...new Set(allGenres)];

        if (uniqueGenres.length === 0) {
          return [];
        }

        const shuffledGenres = [...uniqueGenres].sort(
          () => Math.random() - 0.5,
        );
        return shuffledGenres;
      },
      getRecommendationParams: () => {
        const state = get();
        const favoritePodcasts = state.favoritePodcasts;

        if (favoritePodcasts.length === 0) {
          return {
            language: state.taddyPodcastsLanguage,
            country: state.taddyPodcastsCountry,
          };
        }

        const genreRotation = state.getGenreRotation();
        let selectedGenre: keyof typeof Genre | undefined;
        if (genreRotation.length > 0) {
          const currentGenreIndex =
            state.lastUsedGenreIndex % genreRotation.length;
          selectedGenre = genreRotation[currentGenreIndex];

          const nextIndex =
            (state.lastUsedGenreIndex + 1) % genreRotation.length;
          set({ lastUsedGenreIndex: nextIndex });
        }

        const allGenres = favoritePodcasts.flatMap((podcast) => podcast.genres);
        const uniqueGenres = [...new Set(allGenres)];

        const languageCounts = favoritePodcasts.reduce(
          (acc, podcast) => {
            if (!podcast.language) return acc;
            acc[podcast.language] = (acc[podcast.language] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const countryCounts = favoritePodcasts.reduce(
          (acc, podcast) => {
            if (!podcast.country) return acc;
            acc[podcast.country] = (acc[podcast.country] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        let mostCommonLanguage: keyof typeof Language | undefined;
        const languageEntries = Object.entries(languageCounts);
        if (languageEntries.length > 0) {
          mostCommonLanguage = languageEntries.reduce((a, b) =>
            languageCounts[a[0]] > languageCounts[b[0]] ? a : b,
          )[0] as keyof typeof Language;
        }

        let mostCommonCountry: keyof typeof Country | undefined;
        const countryEntries = Object.entries(countryCounts);
        if (countryEntries.length > 0) {
          mostCommonCountry = countryEntries.reduce((a, b) =>
            countryCounts[a[0]] > countryCounts[b[0]] ? a : b,
          )[0] as keyof typeof Country;
        }

        const excludeUuids = favoritePodcasts.map((podcast) => podcast.uuid);

        return {
          genres: selectedGenre ? [selectedGenre] : uniqueGenres.slice(0, 3), // Limit to 3 genres max
          language: mostCommonLanguage || state.taddyPodcastsLanguage,
          country: mostCommonCountry || state.taddyPodcastsCountry,
          excludeUuids,
        };
      },
    }),
    {
      name: "podcasts",
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

const usePodcasts = createSelectors(usePodcastsBase);

export default usePodcasts;
