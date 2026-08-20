import { FlashList } from "@shopify/flash-list";
import type { Href } from "expo-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeTabsNav from "@/components/home/HomeTabsNav";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import ServerPodcastEpisodeListItem from "@/components/podcasts/ServerPodcastEpisodeListItem";
import ServerPodcastRow from "@/components/podcasts/ServerPodcastRow";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import { useInfiniteLatestPodcastEpisodes } from "@/hooks/taddyPodcasts/usePodcasts";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  useScopedPodcastFavorites,
  useSyncServerPodcastFavorites,
} from "@/hooks/usePodcastFavorites";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import usePodcasts, { type FavoritePodcast } from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import {
  buildPodcastFeedItems,
  type PodcastFeedItem,
} from "@/utils/podcastFeedItems";

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
  const screenBottomPadding = useScreenBottomPadding();
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

  const {
    data,
    isLoading: isLoadingTaddy,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteLatestPodcastEpisodes({ uuids: taddyUuids });

  // Same parameters as the call inside useSyncServerPodcastFavorites, so both
  // hooks share one query entry (["podcasts", null, true]) — the episodes are
  // already fetched for the favorites reconciliation; this reads them rather
  // than asking again. Keep the two in sync if either changes.
  const { data: serverData, isLoading: isLoadingServer } = useGetPodcasts({
    enabled: capabilities.podcasts,
  });

  const favoriteChannelIds = useMemo(
    () => new Set(serverChannels.map((channel) => channel.id)),
    [serverChannels],
  );

  const feedItems = useMemo(
    () =>
      buildPodcastFeedItems({
        channels: serverData?.podcasts?.channel ?? [],
        favoriteChannelIds,
        taddyEpisodes:
          data?.pages.flatMap(
            (page) => page.data?.getLatestPodcastEpisodes ?? [],
          ) ?? [],
        taddyHasMore: hasNextPage,
      }),
    [serverData, favoriteChannelIds, data, hasNextPage],
  );

  // The server query is gated on actually having favorites here: without that,
  // a Taddy-only feed would be replaced by skeletons while an unrelated query
  // resolves.
  const isLoading =
    isLoadingTaddy || (isLoadingServer && favoriteChannelIds.size > 0);

  const serverFavoritesRow =
    capabilities.podcasts && serverChannels.length > 0 ? (
      <ServerPodcastRow
        title={t("app.podcasts.yourPodcasts")}
        channels={serverChannels}
        skeletonKey="favorite-server-podcasts"
      />
    ) : null;

  // Taddy unconfigured but the backend self-hosts podcasts: the feed above is
  // the focus, so discovery stays a small footer hint rather than a full CTA.
  const taddyDiscoveryHint = podcastsEnabled ? null : (
    <Box className="px-6 mt-8">
      <Text className="text-primary-100 text-sm">
        {t("app.podcasts.taddyDiscoveryHint")}
      </Text>
      <FadeOutScaleDown
        // Cast until expo-router regenerates typed routes for the new
        // nested settings screen on the next dev-server/prebuild run.
        href={"/(app)/(tabs)/(home)/settings/podcasts" as Href}
        className="mt-3 self-start"
      >
        <Text className="text-white font-semibold underline">
          {t("app.podcasts.configureTaddyPodcasts")}
        </Text>
      </FadeOutScaleDown>
    </Box>
  );

  return (
    <Box className="h-full">
      <HomeTabsNav active="favoritePodcasts" />
      {podcastsEnabled || capabilities.podcasts ? (
        <FlashList
          data={isLoading ? loadingData(16) : feedItems}
          renderItem={({
            item,
            index,
          }: {
            item: PodcastFeedItem;
            index: number;
          }) => {
            if (isLoading) return <PodcastListItemSkeleton index={index} />;
            return item.kind === "server" ? (
              <ServerPodcastEpisodeListItem
                episode={item.episode}
                channel={item.channel}
              />
            ) : (
              <PodcastListItem podcast={item.episode} index={index} />
            );
          }}
          keyExtractor={(item, index) => item.key ?? String(index)}
          getItemType={(item) => (isLoading ? "skeleton" : item.kind)}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <>
              {isFetchingNextPage ? (
                <PodcastListItemSkeleton index={1} />
              ) : null}
              {taddyDiscoveryHint}
            </>
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
            paddingBottom: screenBottomPadding,
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            // Nothing subscribed at all (and no Taddy to discover with) is a
            // different dead end from "subscribed, but no episodes yet" — only
            // the former is the user's to fix, so only it gets the instructions.
            !podcastsEnabled && serverChannels.length === 0 ? (
              <Box className="px-6 mt-10">
                <Text className="text-primary-100 text-center">
                  {t("app.favoritePodcasts.noServerFavorites")}
                </Text>
              </Box>
            ) : (
              <EmptyDisplay />
            )
          }
        />
      ) : (
        <Box className="items-center px-6 mt-10">
          <Text className="text-primary-50 text-center">
            {t("app.podcasts.taddyPodcastsNotConfigured")}
          </Text>
          <Center>
            <FadeOutScaleDown
              href={"/(app)/(tabs)/(home)/settings/podcasts" as Href}
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
