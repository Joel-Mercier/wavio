import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { fromUnixTime } from "date-fns/fromUnixTime";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import CirclePlus from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
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
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { formatDistanceToNow } from "@/utils/date";

const AnimatedBox = Animated.createAnimatedComponent(Box);
const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function PodcastScreen() {
  const [white, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const podcast = useLocalSearchParams<{
    id: string;
  }>() as unknown as Partial<PodcastEpisode> & { id: string };
  podcast.podcastSeries = JSON.parse(podcast.podcastSeries as never as string);
  const colors = useImageColors(podcast.imageUrl);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const bottomTabBarHeight = useBottomTabBarHeight();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const offsetY = useSharedValue(0);
  const headerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        offsetY.value,
        [0, 220],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    };
  });
  const artworkStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(
            offsetY.value,
            [0, 220],
            [1, 0.5],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offsetY.value = event.contentOffset.y;
  });
  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present();
  };

  const handleGoToPodcastSeriesPress = () => {
    bottomSheetModalRef.current?.dismiss();
    const series = podcast.podcastSeries;
    if (!series?.uuid) return;
    router.navigate({
      pathname: "/podcast-series/[id]",
      params: {
        id: series.uuid,
        uuid: series.uuid,
        name: series.name,
        description: series.description,
        imageUrl: series.imageUrl,
        authorName: series.authorName,
        genres: series.genres?.join(","),
      },
    });
  };

  const handleAddFavoritePodcastPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!podcast.podcastSeries) return;
    addFavoritePodcast(podcast.podcastSeries);
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
    bottomSheetModalRef.current?.dismiss();
    if (!podcast.podcastSeries?.uuid) return;
    removeFavoritePodcast(podcast.podcastSeries.uuid);
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

  const handleSharePress = async () => {
    try {
      await Share.open({
        title: podcast.name,
        message: podcast.description,
        url: podcast.imageUrl,
        type: "image/jpeg",
        failOnCancel: false,
      });
    } catch (error) {
      console.error(error);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.podcasts.shareErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <Box className="h-full">
      <AnimatedBox
        className="w-full z-10 absolute top-0 left-0 right-0"
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
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <ArrowLeft size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate flex-1"
              size="lg"
            >
              {podcast.name}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </AnimatedBox>
      <Animated.ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top,
          paddingBottom:
            insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
      >
        <VStack>
          <HStack className="mt-6 items-start justify-between">
            <FadeOutScaleDown onPress={() => router.back()}>
              <ArrowLeft size={24} color={white} />
            </FadeOutScaleDown>
            {podcast.imageUrl ? (
              <AnimatedImage
                style={artworkStyle}
                source={{ uri: podcast.imageUrl }}
                className="w-[70%] aspect-square rounded-md"
                alt="Playlist cover"
              />
            ) : (
              <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                <ListMusic size={48} color={white} />
              </Box>
            )}

            <Box className="w-6" />
          </HStack>
          <VStack>
            <VStack className="mt-5 flex-1">
              <Heading className="text-white" size="xl">
                {podcast.name}
              </Heading>
              <FadeOutScaleDown onPress={handleGoToPodcastSeriesPress}>
                <HStack className="mt-4 items-center">
                  {podcast.podcastSeries?.imageUrl ? (
                    <Image
                      source={{ uri: podcast.podcastSeries?.imageUrl }}
                      className="w-8 h-8 rounded-full aspect-square"
                      alt="Podcast series cover"
                    />
                  ) : (
                    <Box className="w-8 h-8 rounded-full bg-primary-600 items-center justify-center">
                      <User size={16} color={white} />
                    </Box>
                  )}
                  <Text
                    className="ml-4 text-white text-md font-bold"
                    numberOfLines={1}
                  >
                    {podcast.podcastSeries?.name}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <Text className="flex-1 text-primary-100 mt-2">
                {podcast.datePublished &&
                  `${formatDistanceToNow(fromUnixTime(podcast.datePublished))} ago`}
                {" ⦁ "}
                {`${secondsToMinutes(podcast.duration || 0)} min`}
              </Text>
            </VStack>

            <HStack className="mt-4 items-center justify-between">
              <HStack className="items-center gap-x-4">
                <FadeOutScaleDown onPress={handleSharePress}>
                  <Share2 color={white} />
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handlePresentModalPress}>
                  <EllipsisVertical color={white} />
                </FadeOutScaleDown>
              </HStack>
              <HStack className="items-center gap-x-4">
                <FadeOutScaleDown>
                  <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                    <Play color={white} fill={white} />
                  </Box>
                </FadeOutScaleDown>
              </HStack>
            </HStack>
            {podcast.description && (
              <RichText className="text-md text-white mt-4">
                {podcast.description}
              </RichText>
            )}
            <FadeOutScaleDown onPress={handleGoToPodcastSeriesPress}>
              <HStack className="mt-6 items-center justify-between">
                <Text className="text-white text-lg">
                  {t("app.podcasts.seeAllEpisodes")}
                </Text>
                <ChevronRight size={24} color={white} />
              </HStack>
            </FadeOutScaleDown>
          </VStack>
        </VStack>
      </Animated.ScrollView>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              {podcast.imageUrl ? (
                <Image
                  source={{ uri: podcast.imageUrl }}
                  className="w-16 h-16 rounded-md aspect-square"
                  alt="Podcast cover"
                />
              ) : (
                <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                  <Podcast size={24} color={white} />
                </Box>
              )}
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {podcast.name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {podcast?.podcastSeries?.name}
                </Text>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handleGoToPodcastSeriesPress}>
                <HStack className="items-center">
                  <Podcast size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.podcasts.goToPodcastSeries")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {podcast?.podcastSeries?.isFavorite ? (
                <FadeOutScaleDown onPress={handleRemoveFavoritePodcastPress}>
                  <HStack className="items-center">
                    <CircleMinus size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.podcasts.removeFromFavorites")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ) : (
                <FadeOutScaleDown onPress={handleAddFavoritePodcastPress}>
                  <HStack className="items-center">
                    <CirclePlus size={24} color={gray200} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.podcasts.addToFavorites")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
