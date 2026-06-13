import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import type {
  Country,
  Genre,
  Language,
  PodcastSeries,
} from "@/services/taddyPodcasts/types";
import createSelectors from "@/utils/createSelectors";

// Where a favorited podcast came from. "taddy" podcasts are discovered through
// the Taddy API; "server" podcasts are channels hosted by an OpenSubsonic
// server (getPodcasts). Taddy-only metadata (genres/language/country) is absent
// for server podcasts, hence optional.
export type PodcastSource = "taddy" | "server";

export interface FavoritePodcast {
  // For "taddy" podcasts this is the Taddy uuid; for "server" podcasts it is
  // the Subsonic PodcastChannel id.
  uuid: string;
  name: string;
  genres?: (keyof typeof Genre)[];
  language?: keyof typeof Language;
  country?: keyof typeof Country;
  imageUrl: string;
  authorName: string;
  dateAdded: number;
  isFavorite: boolean;
  source: PodcastSource;
  // "server" podcasts only: the Subsonic coverArt id (resolved via artworkUrl
  // when imageUrl is empty) and the channel feed url.
  coverArt?: string;
  url?: string;
  // Auth scope (getAuthScope) of the origin server for "server" favorites, so
  // we only sync/prune them against the server they belong to. Undefined for
  // "taddy" favorites, which are server-independent.
  scope?: string;
}

// Favorites that belong to the given auth scope: server favorites from other
// accounts are excluded (their ids are server-assigned and can collide across
// servers), Taddy favorites are server-independent and always included.
export function podcastFavoritesForScope(
  favorites: FavoritePodcast[],
  scope: string | null | undefined,
): FavoritePodcast[] {
  return favorites.filter(
    (fav) => fav.source !== "server" || fav.scope === scope,
  );
}

export interface RecommendationParams {
  genres?: (keyof typeof Genre)[];
  language?: keyof typeof Language;
  country?: keyof typeof Country;
  excludeUuids?: string[];
}

const DEFAULT_TADDY_API_KEY =
  process.env.EXPO_PUBLIC_TADDY_PODCASTS_API_KEY || "";
const DEFAULT_TADDY_USER_ID =
  process.env.EXPO_PUBLIC_TADDY_PODCASTS_API_USER_ID || "";
const DEFAULT_TADDY_LANGUAGE =
  (process.env.EXPO_PUBLIC_TADDY_PODCASTS_API_LANGUAGE as
    | keyof typeof Language
    | undefined) || "ENGLISH";
const DEFAULT_TADDY_COUNTRY =
  (process.env.EXPO_PUBLIC_TADDY_PODCASTS_API_COUNTRY as
    | keyof typeof Country
    | undefined) || "UNITED_STATES_OF_AMERICA";

const DEFAULT_GENRES: (keyof typeof Genre)[] = [
  "PODCASTSERIES_NEWS_DAILY_NEWS",
  "PODCASTSERIES_COMEDY",
  "PODCASTSERIES_TECHNOLOGY",
  "PODCASTSERIES_SCIENCE",
  "PODCASTSERIES_HISTORY",
  "PODCASTSERIES_BUSINESS",
];

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
  addFavoriteServerPodcast: (channel: PodcastChannel, scope?: string) => void;
  removeFavoritePodcast: (uuid: string) => void;
  updateFavoriteServerPodcast: (
    uuid: string,
    patch: Partial<
      Pick<
        FavoritePodcast,
        "name" | "imageUrl" | "coverArt" | "url" | "authorName"
      >
    >,
  ) => void;
  clearFavoritePodcasts: () => void;
  getRecommendationParams: () => RecommendationParams;
  getGenreRotation: () => (keyof typeof Genre)[];
  getTopGenres: (limit?: number) => (keyof typeof Genre)[];
  lastUsedGenreIndex: number;
  setLastUsedGenreIndex: (index: number) => void;
  advanceGenreRotation: () => void;
}

export const usePodcastsBase = create<PodcastsStore>()(
  persist(
    (set, get) => ({
      taddyPodcastsApiKey: DEFAULT_TADDY_API_KEY,
      taddyPodcastsUserId: DEFAULT_TADDY_USER_ID,
      taddyPodcastsLanguage: DEFAULT_TADDY_LANGUAGE,
      taddyPodcastsCountry: DEFAULT_TADDY_COUNTRY,
      setTaddyPodcastsConfig: ({ apiKey, userId, language, country }) => {
        set({
          taddyPodcastsApiKey: apiKey,
          taddyPodcastsUserId: userId,
          taddyPodcastsLanguage: language,
          taddyPodcastsCountry: country,
        });
      },
      clearTaddyPodcastsConfig: () => {
        set({
          taddyPodcastsApiKey: DEFAULT_TADDY_API_KEY,
          taddyPodcastsUserId: DEFAULT_TADDY_USER_ID,
          taddyPodcastsLanguage: DEFAULT_TADDY_LANGUAGE,
          taddyPodcastsCountry: DEFAULT_TADDY_COUNTRY,
        });
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
            source: "taddy",
          };
          const newFavoritePodcasts = [
            favoritePodcast,
            ...state.favoritePodcasts,
          ];
          return { favoritePodcasts: newFavoritePodcasts };
        });
      },
      addFavoriteServerPodcast: (channel: PodcastChannel, scope?: string) => {
        set((state) => {
          if (state.favoritePodcasts.some((fav) => fav.uuid === channel.id)) {
            return { favoritePodcasts: state.favoritePodcasts };
          }
          const favoritePodcast: FavoritePodcast = {
            uuid: channel.id,
            name: channel.title || channel.url,
            imageUrl: channel.originalImageUrl || "",
            coverArt: channel.coverArt,
            url: channel.url,
            authorName: channel.author || "",
            isFavorite: true,
            dateAdded: Date.now(),
            source: "server",
            scope,
          };
          return {
            favoritePodcasts: [favoritePodcast, ...state.favoritePodcasts],
          };
        });
      },
      updateFavoriteServerPodcast: (uuid, patch) => {
        set((state) => ({
          favoritePodcasts: state.favoritePodcasts.map((fav) =>
            fav.uuid === uuid ? { ...fav, ...patch } : fav,
          ),
        }));
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
      advanceGenreRotation: () => {
        const state = get();
        const genreRotation = state.getGenreRotation();
        if (genreRotation.length === 0) return;
        const nextIndex = (state.lastUsedGenreIndex + 1) % genreRotation.length;
        set({ lastUsedGenreIndex: nextIndex });
      },
      getGenreRotation: () => {
        const state = get();
        const topGenres = state.getTopGenres();
        if (topGenres.length > 0) return topGenres;
        return DEFAULT_GENRES;
      },
      getTopGenres: (limit = 3) => {
        const state = get();
        const counts = state.favoritePodcasts.reduce(
          (acc, podcast) => {
            for (const genre of podcast.genres ?? []) {
              acc[genre] = (acc[genre] || 0) + 1;
            }
            return acc;
          },
          {} as Record<string, number>,
        );
        return (Object.keys(counts) as (keyof typeof Genre)[])
          .sort((a, b) => counts[b] - counts[a])
          .slice(0, limit);
      },
      getRecommendationParams: () => {
        const state = get();
        const favoritePodcasts = state.favoritePodcasts;

        const genres = state.getGenreRotation();

        if (favoritePodcasts.length === 0) {
          return {
            genres,
            language: state.taddyPodcastsLanguage,
            country: state.taddyPodcastsCountry,
            excludeUuids: [],
          };
        }

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
          genres,
          language: mostCommonLanguage || state.taddyPodcastsLanguage,
          country: mostCommonCountry || state.taddyPodcastsCountry,
          excludeUuids,
        };
      },
    }),
    {
      name: "podcasts",
      storage: createJSONStorage(() => zustandStorage),
      version: 1,
      // v0 → v1: favorites predate the server/taddy split, so backfill the
      // source discriminator (every existing favorite came from Taddy).
      migrate: (persistedState, version) => {
        const state = persistedState as {
          favoritePodcasts?: FavoritePodcast[];
        };
        if (version < 1 && Array.isArray(state?.favoritePodcasts)) {
          state.favoritePodcasts = state.favoritePodcasts.map((fav) => ({
            ...fav,
            source: fav.source ?? "taddy",
          }));
        }
        return state as PodcastsStore;
      },
    },
  ),
);

const usePodcasts = createSelectors(usePodcastsBase);

export default usePodcasts;
