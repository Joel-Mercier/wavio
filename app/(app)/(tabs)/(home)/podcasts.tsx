import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { type ReactElement, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import FavoritePodcastListItem from "@/components/podcasts/FavoritePodcastListItem";
import PodcastSeriesRow from "@/components/podcasts/PodcastSeriesRow";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  usePopularContent,
  useTopChartsByCountry,
  useTopChartsByGenres,
} from "@/hooks/taddyPodcasts/usePodcasts";
import type { Genre } from "@/services/taddyPodcasts/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";

export default function PodcastsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
  const favorites = usePodcasts((store) => store.favoritePodcasts);
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const getRecommendationParams = usePodcasts(
    (store) => store.getRecommendationParams,
  );
  const lastUsedGenreIndex = usePodcasts((store) => store.lastUsedGenreIndex);
  const insets = useSafeAreaInsets();
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
      <HStack
        className="px-6 gap-x-4 my-6 items-center"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
          <Avatar className="border-emerald-500 border-2 w-10 h-10">
            <AvatarFallbackText className="font-body ">
              {username}
            </AvatarFallbackText>
          </Avatar>
        </FadeOutScaleDown>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <HStack className="items-center">
            <FadeOutScaleDown
              onPress={() => router.navigate("/(app)/(tabs)/(home)")}
            >
              <Badge className="rounded-full bg-gray-800 px-4 py-1 mr-2">
                <BadgeText className="normal-case text-md text-white">
                  {t("app.home.tabs.music")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
            <Badge className="p-0 bg-transparent">
              <FadeOutScaleDown
                onPress={() => router.navigate("/(app)/(tabs)/(home)/podcasts")}
              >
                <Badge className="rounded-full rounded-r-none bg-emerald-500 text-primary-800 px-4 pr-4 py-1">
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.home.tabs.podcasts")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  router.navigate("/(app)/(tabs)/(home)/favorite-podcasts")
                }
              >
                <Badge className="rounded-full rounded-l-none bg-gray-800 px-4 py-1 mr-2">
                  <BadgeText className="normal-case text-md text-white">
                    {t("app.home.tabs.favoritePodcasts")}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            </Badge>
          </HStack>
        </ScrollView>
      </HStack>
      {taddyPodcastApiKey && taddyPodcastUserId ? (
        <ScrollView
          contentContainerStyle={{
            paddingBottom:
              tabBarHeight + FLOATING_PLAYER_HEIGHT + insets.bottom * 2,
          }}
          showsVerticalScrollIndicator={false}
        >
          <FadeOutScaleDown
            href={"/(app)/(tabs)/(home)/podcasts/search"}
            className="mb-4"
          >
            <HStack className="mx-6 px-4 gap-x-4 h-10 rounded-lg bg-primary-600 items-center">
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
          {favorites && (
            <VStack className="gap-y-4 px-6">
              {favorites
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
                        {favorites[index + 1] && (
                          <FavoritePodcastListItem
                            key={favorites[index + 1].uuid}
                            podcast={favorites[index + 1]}
                          />
                        )}
                        {favorites[index + 2] && (
                          <FavoritePodcastListItem
                            key={favorites[index + 2].uuid}
                            podcast={favorites[index + 2]}
                          />
                        )}
                        {favorites[index + 3] && (
                          <FavoritePodcastListItem
                            key={favorites[index + 3].uuid}
                            podcast={favorites[index + 3]}
                          />
                        )}
                      </HStack>,
                    );
                  }
                  return rows;
                }, [])}
            </VStack>
          )}
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
        </ScrollView>
      ) : (
        <Box className="items-center justify-center self-center content-center h-full">
          <Text className="text-primary-50">
            {t("app.podcasts.taddyPodcastsNotConfigured")}
          </Text>
          <Center>
            <FadeOutScaleDown
              href={"/(app)/(tabs)/(home)/settings"}
              className="mt-6 items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.podcasts.configureTaddyPodcasts")}
              </Text>
            </FadeOutScaleDown>
          </Center>
        </Box>
      )}
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
