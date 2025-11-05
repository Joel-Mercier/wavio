import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { usePodcastSeries } from "@/hooks/taddyPodcasts/usePodcasts";
import useImageColors from "@/hooks/useImageColors";
import type {
  Genre,
  PodcastEpisode,
  PodcastSeries,
} from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Podcast } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

export default function PodcastSeriesScreen() {
  const { t } = useTranslation();
  const podcastSeries = useLocalSearchParams<
    Partial<PodcastSeries> & { id: string }
  >();
  podcastSeries.genres = (podcastSeries.genres as never as string)?.split(",");
  const { data, isLoading, error } = usePodcastSeries({
    uuid: podcastSeries.id,
  });
  const colors = useImageColors(podcastSeries.imageUrl);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const offsetY = useSharedValue(0);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const addFavoritePodcast = usePodcasts.use.addFavoritePodcast();
  const removeFavoritePodcast = usePodcasts.use.removeFavoritePodcast();
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(offsetY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });

  const handleAddFavoritePodcastPress = () => {
    addFavoritePodcast(podcastSeries);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.addToFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleRemoveFavoritePodcastPress = () => {
    removeFavoritePodcast(podcastSeries.id);
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {t("app.podcasts.removeFromFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient
          colors={[
            (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
              "#000",
            (colors?.platform === "ios"
              ? colors.primary
              : colors?.darkVibrant) || "#000",
          ]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white font-bold"
              size="lg"
            >
              {podcastSeries.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <AnimatedFlashList
        onScroll={scrollHandler}
        data={data?.data?.getPodcastSeries?.episodes || loadingData(4)}
        renderItem={({
          item,
          index,
        }: { item: PodcastEpisode; index: number }) =>
          isLoading ? (
            <PodcastListItemSkeleton index={index} />
          ) : (
            <PodcastListItem
              podcast={item}
              index={index}
              isFavorite={data?.data?.getPodcastSeries?.isFavorite}
              seriesName={podcastSeries.name}
            />
          )
        }
        ListHeaderComponent={() => (
          <LinearGradient
            colors={[
              (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
                "#000",
              "#000",
            ]}
            locations={[0, 0.8]}
            className="px-6"
            style={{ paddingTop: insets.top }}
          >
            <VStack className="mt-6">
              <FadeOutScaleDown
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full bg-black/40 items-center justify-center mb-6"
              >
                <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
              <HStack className="items-center gap-x-4">
                {podcastSeries.imageUrl ? (
                  <Image
                    source={{ uri: podcastSeries.imageUrl }}
                    className="w-32 h-32 rounded-md aspect-square"
                    alt={podcastSeries.name}
                  />
                ) : (
                  <Box className="w-32 h-32 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <Podcast size={24} color={themeConfig.theme.colors.white} />
                  </Box>
                )}
                <VStack className="flex-1">
                  <Heading
                    numberOfLines={2}
                    className="text-white font-bold"
                    size="xl"
                  >
                    {podcastSeries.name}
                  </Heading>
                  <Text className="text-white" numberOfLines={1}>
                    {podcastSeries.authorName}
                  </Text>
                </VStack>
              </HStack>
              <VStack className="mt-4">
                {podcastSeries?.genres && (
                  <Text className="text-primary-100">
                    {Array.isArray(podcastSeries?.genres)
                      ? podcastSeries?.genres
                          ?.map((genre) => t(`app.podcasts.genres.${genre}`))
                          ?.join(", ")
                      : t(`app.podcasts.genres.${podcastSeries?.genres}`)}
                  </Text>
                )}
                <FadeOutScaleDown
                  onPress={() =>
                    podcastSeries.isFavorite
                      ? handleRemoveFavoritePodcastPress()
                      : handleAddFavoritePodcastPress()
                  }
                  className="border border-white rounded-full self-start mt-4 py-1 px-2.5"
                >
                  <Text className="text-white">
                    {podcastSeries.isFavorite
                      ? t("app.podcasts.unsubscribe")
                      : t("app.podcasts.subscribe")}
                  </Text>
                </FadeOutScaleDown>
              </VStack>
            </VStack>
          </LinearGradient>
        )}
        contentContainerStyle={{
          paddingBottom: insets.bottom + bottomTabBarHeight,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      />
    </Box>
  );
}
