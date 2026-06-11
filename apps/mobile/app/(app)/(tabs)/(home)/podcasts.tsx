import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import { type ReactElement, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import FavoritePodcastListItem from "@/components/podcasts/FavoritePodcastListItem";
import PodcastSeriesRow from "@/components/podcasts/PodcastSeriesRow";
import ServerPodcastRow from "@/components/podcasts/ServerPodcastRow";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import {
  usePopularContent,
  useTopChartsByCountry,
  useTopChartsByGenres,
} from "@/hooks/taddyPodcasts/usePodcasts";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useSyncServerPodcastFavorites } from "@/hooks/usePodcastFavorites";
import type { Genre } from "@/services/taddyPodcasts/types";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";

export default function PodcastsScreen() {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const tabBarHeight = useBottomTabBarHeight();
  const capabilities = useCapabilities();
  const scope = useCurrentAuthScope();
  const favorites = usePodcasts((store) => store.favoritePodcasts);
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const podcastsEnabled = Boolean(taddyPodcastApiKey && taddyPodcastUserId);
  const getRecommendationParams = usePodcasts(
    (store) => store.getRecommendationParams,
  );
  const lastUsedGenreIndex = usePodcasts((store) => store.lastUsedGenreIndex);
  const insets = useSafeAreaInsets();

  useSyncServerPodcastFavorites();

  // One favorites grid for everything: Taddy subscriptions plus self-hosted
  // (server/local) channels favorited on the active server — scoped so another
  // server's favorites don't leak in.
  const favoriteItems = useMemo(
    () =>
      favorites.filter((fav) => fav.source !== "server" || fav.scope === scope),
    [favorites, scope],
  );

  const {
    data: serverData,
    isLoading: isLoadingServer,
    error: serverError,
  } = useGetPodcasts({ enabled: capabilities.podcasts });
  const serverChannels = useMemo(
    () => serverData?.podcasts?.channel ?? [],
    [serverData],
  );

  const recommandationParams = useMemo(
    () => getRecommendationParams(),
    // getRecommendationParams reads favoritePodcasts and lastUsedGenreIndex
    // from the store; subscribe via these deps so the memo refreshes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: store getter deps
    [getRecommendationParams, favorites, lastUsedGenreIndex],
  );
  const genreRows = (recommandationParams.genres ?? []).slice(
    0,
    3,
  ) as (keyof typeof Genre)[];
  const {
    data: topChartsByCountry,
    isLoading: isLoadingTopChartsByCountry,
    error: topChartsByCountryError,
  } = useTopChartsByCountry({
    type: "PODCASTSERIES",
    country: recommandationParams.country,
  });
  const {
    data: popularContent,
    isLoading: isLoadingPopularContent,
    error: popularContentError,
  } = usePopularContent({
    language: recommandationParams.language,
  });

  return (
    <Box>
      <HomeTabsNav active="podcasts" />
      <ScrollView
        contentContainerStyle={{
          paddingBottom:
            tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        {(podcastsEnabled || capabilities.podcasts) && (
          <HStack className="mx-6 mb-4 gap-x-4 items-center">
            {podcastsEnabled && (
              <FadeOutScaleDown
                href={"/(app)/(tabs)/(home)/podcasts/search"}
                className="flex-1"
              >
                <HStack className="px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
                  <Search
                    size={20}
                    color={"rgb(128, 128, 128)"}
                    className="text-primary-100"
                  />
                  <Text className="text-primary-100 text-sm">
                    {t("app.podcasts.searchPlaceholder")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            )}
            {capabilities.podcasts && (
              <FadeOutScaleDown href={"/podcast-channels/new"}>
                <Plus color={white} />
              </FadeOutScaleDown>
            )}
          </HStack>
        )}

        {favoriteItems.length > 0 && (
          <VStack className="gap-y-4 px-6 mt-4">
            {favoriteItems
              .slice(0, 8)
              .reduce((rows: ReactElement[], favorite, index) => {
                if (index % 4 === 0) {
                  rows.push(
                    <HStack
                      key={`row-${Math.floor(index / 4)}`}
                      className="gap-x-4"
                    >
                      <FavoritePodcastListItem
                        key={favorite.uuid}
                        podcast={favorite}
                      />
                      {favoriteItems[index + 1] && (
                        <FavoritePodcastListItem
                          key={favoriteItems[index + 1].uuid}
                          podcast={favoriteItems[index + 1]}
                        />
                      )}
                      {favoriteItems[index + 2] && (
                        <FavoritePodcastListItem
                          key={favoriteItems[index + 2].uuid}
                          podcast={favoriteItems[index + 2]}
                        />
                      )}
                      {favoriteItems[index + 3] && (
                        <FavoritePodcastListItem
                          key={favoriteItems[index + 3].uuid}
                          podcast={favoriteItems[index + 3]}
                        />
                      )}
                    </HStack>,
                  );
                }
                return rows;
              }, [])}
          </VStack>
        )}

        {capabilities.podcasts &&
          (serverChannels.length > 0 || isLoadingServer ? (
            <ServerPodcastRow
              title={t("app.podcasts.yourPodcasts")}
              isLoading={isLoadingServer}
              error={serverError}
              channels={serverChannels}
              skeletonKey="your-podcasts"
            />
          ) : (
            <VStack className="px-6 mt-4 mb-2 gap-y-2">
              <Heading size="xl" className="text-white">
                {t("app.podcasts.yourPodcasts")}
              </Heading>
              <Text className="text-primary-100">
                {t("app.podcasts.noServerPodcasts")}
              </Text>
            </VStack>
          ))}

        {podcastsEnabled ? (
          <>
            <PodcastSeriesRow
              title={t("app.podcasts.dailyTopChartsByCountry", {
                country: recommandationParams.country,
              })}
              isLoading={isLoadingTopChartsByCountry}
              error={topChartsByCountryError}
              podcastSeries={
                topChartsByCountry?.data?.getTopChartsByCountry?.podcastSeries
              }
              skeletonKey="top-charts-by-country"
            />
            {genreRows.map((genre) => (
              <GenreChartRow key={genre} genre={genre} />
            ))}
            {recommandationParams.language && (
              <PodcastSeriesRow
                title={t("app.podcasts.popularInLanguage", {
                  language: recommandationParams.language,
                })}
                isLoading={isLoadingPopularContent}
                error={popularContentError}
                podcastSeries={
                  popularContent?.data?.getPopularContent?.podcastSeries
                }
                skeletonKey="popular-content"
              />
            )}
          </>
        ) : capabilities.podcasts ? (
          // Taddy unconfigured but the backend self-hosts podcasts: keep the
          // favorites + self-hosted sections above as the focus and offer Taddy
          // discovery as a small, non-dominating hint rather than a full CTA.
          <Box className="px-6 mt-8">
            <Text className="text-primary-100 text-sm">
              {t("app.podcasts.taddyDiscoveryHint")}
            </Text>
            <FadeOutScaleDown
              href={{
                pathname: "/(app)/(tabs)/(home)/settings",
                params: { section: "podcasts" },
              }}
              className="mt-3 self-start"
            >
              <Text className="text-white font-semibold underline">
                {t("app.podcasts.configureTaddyPodcasts")}
              </Text>
            </FadeOutScaleDown>
          </Box>
        ) : (
          <Box className="items-center px-6 mt-10">
            <Text className="text-primary-50 text-center">
              {t("app.podcasts.taddyPodcastsNotConfigured")}
            </Text>
            <Center>
              <FadeOutScaleDown
                href={{
                  pathname: "/(app)/(tabs)/(home)/settings",
                  params: { section: "podcasts" },
                }}
                className="mt-6 items-center justify-center py-3 px-8 border border-white rounded-full"
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.podcasts.configureTaddyPodcasts")}
                </Text>
              </FadeOutScaleDown>
            </Center>
          </Box>
        )}
      </ScrollView>
    </Box>
  );
}

function GenreChartRow({ genre }: { genre: keyof typeof Genre }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useTopChartsByGenres({
    type: "PODCASTSERIES",
    genres: [genre],
  });
  return (
    <PodcastSeriesRow
      title={t("app.podcasts.dailyTopChartsByGenre", { genre })}
      isLoading={isLoading}
      error={error}
      podcastSeries={data?.data?.getTopChartsByGenres?.podcastSeries}
      skeletonKey={`top-charts-by-genre-${genre}`}
    />
  );
}
