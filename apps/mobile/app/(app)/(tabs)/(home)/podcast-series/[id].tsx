import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CollapsibleTabs, {
  type CollapsibleSceneProps,
} from "@/components/CollapsibleTabs";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PodcastListItem from "@/components/podcasts/PodcastListItem";
import PodcastListItemSkeleton from "@/components/podcasts/PodcastListItemSkeleton";
import PodcastSeriesListItem from "@/components/podcasts/PodcastSeriesListItem";
import RichText from "@/components/RichText";
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
import {
  useInfinitePodcastSeries,
  usePopularContent,
} from "@/hooks/taddyPodcasts/usePodcasts";
import useImageColors from "@/hooks/useImageColors";
import type {
  Genre,
  Language,
  PodcastEpisode,
  PodcastSeries,
} from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

const APP_BAR_ROW_HEIGHT = 56;
const TAB_BAR_HEIGHT = 48;

export default function PodcastSeriesScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const podcastSeries = useLocalSearchParams<{
    id: string;
  }>() as unknown as Partial<PodcastSeries> & { id: string };
  podcastSeries.genres = (podcastSeries.genres as never as string)?.split(
    ",",
  ) as PodcastSeries["genres"];
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePodcastSeries({
      uuid: podcastSeries.id,
    });
  const episodes = useMemo(
    () =>
      data?.pages.flatMap(
        (page) => page.data?.getPodcastSeries?.episodes ?? [],
      ) ?? [],
    [data],
  );
  const series = data?.pages?.[0]?.data?.getPodcastSeries ?? null;
  const description = series?.description ?? null;
  const firstGenre = podcastSeries.genres?.[0];
  const seriesLanguage = series?.language as keyof typeof Language | undefined;
  const { data: similarData, isLoading: isLoadingSimilar } = usePopularContent({
    genres: firstGenre ? [firstGenre as keyof typeof Genre] : undefined,
    language: seriesLanguage,
    limitPerPage: 25,
  });
  const similarPodcasts = useMemo(() => {
    const list = similarData?.data?.getPopularContent?.podcastSeries ?? [];
    return list.filter((p) => p.uuid !== podcastSeries.id);
  }, [similarData, podcastSeries.id]);
  const colors = useImageColors(podcastSeries.imageUrl);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const scrollY = useSharedValue(0);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const isFavorite = usePodcasts((store) =>
    store.favoritePodcasts.some((fav) => fav.uuid === podcastSeries.id),
  );
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
    };
  });

  const minTopInset = insets.top + APP_BAR_ROW_HEIGHT;

  const handleAddFavoritePodcastPress = () => {
    addFavoritePodcast(podcastSeries as PodcastSeries);
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

  const renderHeader = () => (
    <LinearGradient
      colors={[
        (colors?.platform === "ios" ? colors.primary : colors?.lightMuted) ||
          "#000",
        "#000",
      ]}
      locations={[0, 1]}
      style={{ paddingTop: minTopInset, paddingHorizontal: 24 }}
    >
      <VStack className="pt-2 pb-6">
        <HStack className="items-center gap-x-4">
          {podcastSeries.imageUrl ? (
            <Image
              source={{ uri: podcastSeries.imageUrl }}
              className="w-32 h-32 rounded-md aspect-square"
              alt={podcastSeries.name}
            />
          ) : (
            <Box className="w-32 h-32 aspect-square rounded-md bg-primary-800 items-center justify-center">
              <Podcast size={24} color={white} />
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
                : t(
                    `app.podcasts.genres.${podcastSeries?.genres as unknown as string}`,
                  )}
            </Text>
          )}
          <FadeOutScaleDown
            onPress={() =>
              isFavorite
                ? handleRemoveFavoritePodcastPress()
                : handleAddFavoritePodcastPress()
            }
            className="border border-white rounded-full self-start mt-4 py-1 px-2.5"
          >
            <Text className="text-white">
              {isFavorite
                ? t("app.podcasts.unsubscribe")
                : t("app.podcasts.subscribe")}
            </Text>
          </FadeOutScaleDown>
        </VStack>
      </VStack>
    </LinearGradient>
  );

  const renderEpisodes = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <AnimatedFlashList
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      data={isLoading ? loadingData(4) : episodes}
      renderItem={({ item, index }: { item: PodcastEpisode; index: number }) =>
        isLoading ? (
          <PodcastListItemSkeleton index={index} />
        ) : (
          <PodcastListItem
            podcast={item}
            index={index}
            isFavorite={isFavorite}
            seriesName={podcastSeries.name}
            episodes={episodes}
          />
        )
      }
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={() =>
        isFetchingNextPage ? <PodcastListItemSkeleton index={1} /> : null
      }
      contentContainerStyle={{
        paddingTop: contentTopInset,
        paddingBottom: insets.bottom + bottomTabBarHeight,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  const renderAbout = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <Animated.ScrollView
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingTop: contentTopInset + 24,
        paddingHorizontal: 24,
        paddingBottom:
          insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        minHeight: contentTopInset + 600,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    >
      {description ? (
        <RichText className="text-white">{description}</RichText>
      ) : (
        <Text className="text-primary-100">{t("app.podcasts.aboutEmpty")}</Text>
      )}
    </Animated.ScrollView>
  );

  const renderMoreLikeThis = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <AnimatedFlashList
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      data={isLoadingSimilar ? loadingData(4) : similarPodcasts}
      renderItem={({ item, index }: { item: PodcastSeries; index: number }) =>
        isLoadingSimilar ? (
          <PodcastListItemSkeleton index={index} />
        ) : (
          <PodcastSeriesListItem podcast={item} index={index} />
        )
      }
      ListEmptyComponent={() =>
        !isLoadingSimilar ? (
          <Box className="px-6 mt-8">
            <Text className="text-primary-100">
              {t("app.podcasts.moreLikeThisEmpty")}
            </Text>
          </Box>
        ) : null
      }
      contentContainerStyle={{
        paddingTop: contentTopInset,
        paddingBottom:
          insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  const tabs = [
    {
      key: "episodes",
      title: t("app.podcasts.tabEpisodes"),
      render: renderEpisodes,
    },
    {
      key: "about",
      title: t("app.podcasts.tabAbout"),
      render: renderAbout,
    },
    {
      key: "more",
      title: t("app.podcasts.tabMoreLikeThis"),
      render: renderMoreLikeThis,
    },
  ];

  return (
    <Box className="h-full bg-black">
      <CollapsibleTabs
        tabs={tabs}
        renderHeader={renderHeader}
        tabBarHeight={TAB_BAR_HEIGHT}
        minTopInset={minTopInset}
        scrollY={scrollY}
      />
      <Animated.View
        pointerEvents="box-none"
        className="w-full z-20 absolute top-0 left-0 right-0"
        style={[headerStyle]}
      >
        <LinearGradient
          colors={[
            (colors?.platform === "ios"
              ? colors.primary
              : colors?.lightMuted) || "#000",
            (colors?.platform === "ios" ? colors.primary : colors?.darkMuted) ||
              "#000",
          ]}
        >
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <Box className="w-10" />
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate flex-1 ml-4"
              size="lg"
            >
              {podcastSeries.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </Animated.View>
      <Box
        pointerEvents="box-none"
        className="absolute left-0 right-0 z-30"
        style={{ top: insets.top + 8 }}
      >
        <Box className="px-6">
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <ArrowLeft size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
        </Box>
      </Box>
    </Box>
  );
}
