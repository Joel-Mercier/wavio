import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FavoritePodcastListItem from "@/components/podcasts/FavoritePodcastListItem";
import PodcastSeriesListItem from "@/components/podcasts/PodcastSeriesListItem";
import PodcastSeriesListItemSkeleton from "@/components/podcasts/PodcastSeriesListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useTopChartsByCountry,
  useTopChartsByGenres,
} from "@/hooks/taddyPodcasts/usePodcasts";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function PodcastsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setShowDrawer = useApp.use.setShowDrawer();
  const username = useAuth.use.username();
  const favorites = usePodcasts.use.favoritePodcasts();
  const getRecommendationParams = usePodcasts.use.getRecommendationParams();
  const insets = useSafeAreaInsets();
  const recommandationParams = getRecommendationParams();
  const {
    data: topChartsByCountry,
    isLoading: isLoadingTopChartsByCountry,
    error: topChartsByCountryError,
  } = useTopChartsByCountry({
    type: "PODCASTSERIES",
    country: recommandationParams.country,
  });
  const {
    data: topChartsByGenre,
    isLoading: isLoadingTopChartsByGenre,
    error: topChartsByGenreError,
  } = useTopChartsByGenres({
    type: "PODCASTSERIES",
    genres: recommandationParams?.genres?.[0],
  });
  console.log(recommandationParams);
  return (
    <Box>
      <HStack
        className="px-6 gap-x-4 my-6 items-center"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => setShowDrawer(true)}>
          <Avatar size="sm" className="border-emerald-500 border-2">
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
            .reduce((rows: JSX.Element[], favorite, index) => {
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
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {t("app.podcasts.dailyTopChartsByCountry", {
            country: recommandationParams.country,
          })}
        </Heading>
      </Box>
      {topChartsByCountryError ? (
        <ErrorDisplay error={topChartsByCountryError} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mb-6 pl-6"
        >
          {isLoadingTopChartsByCountry ? (
            loadingData(4).map((_, index) => (
              <PodcastSeriesListItemSkeleton
                key={`top-charts-by-country-${index}`}
                index={index}
                layout="horizontal"
              />
            ))
          ) : (
            <>
              {topChartsByCountry?.data?.getTopChartsByCountry?.podcastSeries?.map(
                (podcast, index) => (
                  <PodcastSeriesListItem
                    key={podcast.uuid}
                    podcast={podcast}
                    index={index}
                    layout="horizontal"
                  />
                ),
              )}
            </>
          )}
        </ScrollView>
      )}
      {!isLoadingTopChartsByCountry &&
        !topChartsByCountryError &&
        !topChartsByCountry?.data?.getTopChartsByCountry?.podcastSeries
          ?.length && <EmptyDisplay />}
      <Box className="px-6 mt-4 mb-4">
        <Heading size="xl" className="text-white">
          {t("app.podcasts.dailyTopChartsByGenre", {
            genre: recommandationParams?.genres?.[0],
          })}
        </Heading>
      </Box>
      {topChartsByGenreError ? (
        <ErrorDisplay error={topChartsByGenreError} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="mb-6 pl-6"
        >
          {isLoadingTopChartsByGenre ? (
            loadingData(4).map((_, index) => (
              <PodcastSeriesListItemSkeleton
                key={`top-charts-by-genre-${index}`}
                index={index}
                layout="horizontal"
              />
            ))
          ) : (
            <>
              {topChartsByGenre?.data?.getTopChartsByGenres?.podcastSeries?.map(
                (podcast, index) => (
                  <PodcastSeriesListItem
                    key={podcast.uuid}
                    podcast={podcast}
                    index={index}
                    layout="horizontal"
                  />
                ),
              )}
            </>
          )}
        </ScrollView>
      )}
      {!isLoadingTopChartsByGenre &&
        !topChartsByGenreError &&
        !topChartsByGenre?.data?.getTopChartsByGenres?.podcastSeries
          ?.length && <EmptyDisplay />}
    </Box>
  );
}
