import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { useInfiniteLatestPodcastEpisodes } from "@/hooks/taddyPodcasts/usePodcasts";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";

export default function FavoritePodcastsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const favoritePodcasts = usePodcasts((store) => store.favoritePodcasts);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteLatestPodcastEpisodes({
    uuids: favoritePodcasts.map((podcast) => podcast.uuid),
  });
  const episodes =
    data?.pages.flatMap((page) => page.data?.getLatestPodcastEpisodes ?? []) ??
    [];

  return (
    <Box className="h-full">
      <HomeTabsNav active="favoritePodcasts" />
      {taddyPodcastApiKey && taddyPodcastUserId ? (
        <FlashList
          data={isLoading ? loadingData(16) : episodes}
          renderItem={({
            item,
            index,
          }: {
            item: PodcastEpisode;
            index: number;
          }) =>
            isLoading ? (
              <PodcastListItemSkeleton index={index} />
            ) : (
              <PodcastListItem podcast={item} index={index} />
            )
          }
          keyExtractor={(item, index) => item.uuid ?? String(index)}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() =>
            isFetchingNextPage ? <PodcastListItemSkeleton index={1} /> : null
          }
          ListHeaderComponent={() => (
            <Box className="px-6">
              <Heading className="text-white" size="2xl">
                {t("app.favoritePodcasts.title")}
              </Heading>
            </Box>
          )}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + tabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={() => <EmptyDisplay />}
        />
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
