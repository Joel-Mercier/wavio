import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useInfiniteLatestPodcastEpisodes } from "@/hooks/taddyPodcasts/usePodcasts";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";

export default function FavoritePodcastsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setShowDrawer = useApp((store) => store.setShowDrawer);
  const username = useAuth((store) => store.username);
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
              <Badge className="rounded-full rounded-r-none bg-emerald-500 px-4 py-1 pr-4">
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
              <Badge className="rounded-full rounded-l-none bg-emerald-600 text-primary-800 px-4 py-1 mr-2">
                <BadgeText className="normal-case text-md text-white">
                  {t("app.home.tabs.favoritePodcasts")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
          </Badge>
        </HStack>
      </HStack>
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
            paddingBottom: tabBarHeight + FLOATING_PLAYER_HEIGHT,
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
