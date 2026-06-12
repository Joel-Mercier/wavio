import { FlashList } from "@shopify/flash-list";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import ServerPodcastRow from "@/components/podcasts/ServerPodcastRow";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useInfiniteLatestPodcastEpisodes } from "@/hooks/taddyPodcasts/usePodcasts";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  useScopedPodcastFavorites,
  useSyncServerPodcastFavorites,
} from "@/hooks/usePodcastFavorites";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import usePodcasts, { type FavoritePodcast } from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";

// A favorited self-hosted (local / navidrome / opensubsonic) channel maps back to
// the Subsonic `PodcastChannel` shape so it renders with the same components as
// the live server channels (ServerPodcastRow → ServerPodcastChannelListItem).
function favoriteToChannel(fav: FavoritePodcast): PodcastChannel {
  return {
    id: fav.uuid,
    title: fav.name,
    url: fav.url ?? "",
    coverArt: fav.coverArt,
    originalImageUrl: fav.imageUrl || undefined,
    status: "completed",
  };
}

export default function FavoritePodcastsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const capabilities = useCapabilities();
  const taddyPodcastApiKey = usePodcasts((store) => store.taddyPodcastsApiKey);
  const taddyPodcastUserId = usePodcasts((store) => store.taddyPodcastsUserId);
  const podcastsEnabled = Boolean(taddyPodcastApiKey && taddyPodcastUserId);
  const favoritePodcasts = useScopedPodcastFavorites();

  useSyncServerPodcastFavorites();

  // Favorited self-hosted channels for the active server only (favorites persist
  // across servers; the scope keeps one account's channels out of another's).
  const serverChannels = useMemo(
    () =>
      favoritePodcasts
        .filter((fav) => fav.source === "server")
        .map(favoriteToChannel),
    [favoritePodcasts],
  );

  // Latest episodes are a Taddy-only feed, so only Taddy subscriptions feed it —
  // server channel ids aren't Taddy uuids.
  const taddyUuids = useMemo(
    () =>
      favoritePodcasts
        .filter((fav) => fav.source !== "server")
        .map((fav) => fav.uuid),
    [favoritePodcasts],
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteLatestPodcastEpisodes({ uuids: taddyUuids });
  const episodes =
    data?.pages.flatMap((page) => page.data?.getLatestPodcastEpisodes ?? []) ??
    [];

  const serverFavoritesRow =
    capabilities.podcasts && serverChannels.length > 0 ? (
      <ServerPodcastRow
        title={t("app.podcasts.yourPodcasts")}
        channels={serverChannels}
        skeletonKey="favorite-server-podcasts"
      />
    ) : null;

  return (
    <Box className="h-full">
      <HomeTabsNav active="favoritePodcasts" />
      {podcastsEnabled ? (
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
          ListFooterComponent={
            isFetchingNextPage ? <PodcastListItemSkeleton index={1} /> : null
          }
          ListHeaderComponent={
            <>
              {serverFavoritesRow}
              <Box className="px-6 mt-2">
                <Heading className="text-white" size="xl">
                  {t("app.favoritePodcasts.title")}
                </Heading>
              </Box>
            </>
          }
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + tabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyDisplay />}
        />
      ) : capabilities.podcasts ? (
        // No Taddy: surface the favorited self-hosted channels and keep Taddy
        // discovery as a small, non-dominating hint rather than a full CTA.
        <ScrollView
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + tabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
        >
          {serverChannels.length > 0 ? (
            serverFavoritesRow
          ) : (
            <Box className="px-6 mt-10">
              <Text className="text-primary-100 text-center">
                {t("app.favoritePodcasts.noServerFavorites")}
              </Text>
            </Box>
          )}
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
        </ScrollView>
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
    </Box>
  );
}
