import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useLatestPodcastEpisodes } from "@/hooks/taddyPodcasts/usePodcasts";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import useApp from "@/stores/app";
import useAuth from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function FavoritePodcastsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const setShowDrawer = useApp.use.setShowDrawer();
  const username = useAuth.use.username();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const favoritePodcasts = usePodcasts.use.favoritePodcasts();
  const { data, isLoading, error } = useLatestPodcastEpisodes(
    favoritePodcasts.map((podcast) => podcast.uuid),
  );

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
              <Badge className="rounded-full rounded-r-none bg-gray-800 px-4 py-1 pr-4">
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
              <Badge className="rounded-full rounded-l-none bg-emerald-500 text-primary-800 px-4 py-1 mr-2">
                <BadgeText className="normal-case text-md text-white">
                  {t("app.home.tabs.favoritePodcasts")}
                </BadgeText>
              </Badge>
            </FadeOutScaleDown>
          </Badge>
        </HStack>
      </HStack>
      <FlashList
        data={data?.data?.getLatestPodcastEpisodes || loadingData(16)}
        renderItem={({
          item,
          index,
        }: { item: PodcastEpisode; index: number }) =>
          isLoading ? (
            <PodcastListItemSkeleton index={index} />
          ) : (
            <PodcastListItem podcast={item} index={index} />
          )
        }
        keyExtractor={(item) => item.uuid}
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
      />
    </Box>
  );
}
