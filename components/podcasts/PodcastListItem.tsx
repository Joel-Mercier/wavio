import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { fromUnixTime } from "date-fns/fromUnixTime";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { useRouter } from "expo-router";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import CirclePlus from "lucide-react-native/dist/esm/icons/circle-plus.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Pause from "lucide-react-native/dist/esm/icons/pause.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import Share from "react-native-share";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RichText from "@/components/RichText";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { playTracks, togglePlayPause } from "@/services/player";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import type { PodcastEpisode } from "@/services/taddyPodcasts/types";
import usePodcasts from "@/stores/podcasts";
import { formatDistanceToNow } from "@/utils/date";
import { cn } from "@/utils/tailwind";

interface PodcastListItemProps {
  podcast: PodcastEpisode;
  index: number;
  seriesName?: string;
  isFavorite?: boolean;
  episodes?: PodcastEpisode[];
}

function episodeToTrack(
  episode: PodcastEpisode,
  fallbackSeriesName?: string,
) {
  return {
    id: episode.uuid,
    url: episode.audioUrl,
    title: episode.name,
    artist: fallbackSeriesName || episode?.podcastSeries?.name,
    artwork: episode.imageUrl,
    duration: episode.duration,
    source: "podcast" as const,
  };
}

export default function PodcastListItem({
  podcast,
  index,
  seriesName,
  isFavorite,
  episodes,
}: PodcastListItemProps) {
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isCurrent = playingTrack?.id === podcast.uuid;
  const [white, black, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const toast = useToast();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);

  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present();
  };

  const handleGoToPodcastSeriesPress = () => {
    bottomSheetModalRef.current?.dismiss();
    const series = podcast.podcastSeries;
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

  const handlePlayPress = () => {
    if (isCurrent) {
      togglePlayPause();
      return;
    }
    if (!podcast.audioUrl) return;
    if (episodes && episodes.length > 0) {
      const startIndex = episodes.findIndex((e) => e.uuid === podcast.uuid);
      const tracks = episodes
        .filter((e) => !!e.audioUrl)
        .map((e) => episodeToTrack(e, seriesName));
      const start = Math.max(
        0,
        tracks.findIndex((t) => t.id === podcast.uuid),
      );
      if (tracks.length > 0) {
        playTracks(tracks, start >= 0 ? start : Math.max(0, startIndex));
        return;
      }
    }
    playTracks([episodeToTrack(podcast, seriesName)]);
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
    <Pressable
      onPress={() =>
        router.navigate({
          pathname: "/podcasts/[id]",
          params: {
            id: podcast.uuid,
            uuid: podcast.uuid,
            name: podcast.name,
            description: podcast.description,
            imageUrl: podcast.imageUrl,
            datePublished: podcast.datePublished,
            duration: podcast.duration,
            audioUrl: podcast.audioUrl,
            podcastSeries: JSON.stringify(podcast.podcastSeries),
          },
        })
      }
      className="px-6"
    >
      <VStack
        className={cn("my-3 gap-y-2 border-b border-b-primary-400", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="gap-x-4">
          <Image
            source={{ uri: podcast.imageUrl }}
            className="w-16 h-16 rounded-md aspect-square"
            alt={podcast.name}
          />
          <VStack className="flex-1">
            <Heading className="text-white text-lg" numberOfLines={2}>
              {podcast.name}
            </Heading>
            <Text className="text-primary-100" numberOfLines={1}>
              {seriesName || podcast?.podcastSeries?.name}
            </Text>
          </VStack>
        </HStack>
        <RichText className="flex-1 text-primary-100" numberOfLines={2}>
          {podcast.description}
        </RichText>
        <Text className="flex-1 text-white">
          {podcast.datePublished &&
            t("app.podcasts.publishedAt", {
              distance: formatDistanceToNow(
                fromUnixTime(podcast.datePublished),
              ),
            })}
          {" ⦁ "}
          {`${secondsToMinutes(podcast.duration)} min`}
        </Text>
        <HStack className="items-center justify-between mb-4">
          <HStack className="items-center gap-x-4">
            <FadeOutScaleDown onPress={handleSharePress}>
              <Share2 size={24} color={white} />
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={handlePresentModalPress}>
              <EllipsisVertical size={24} color={white} />
            </FadeOutScaleDown>
          </HStack>
          <FadeOutScaleDown onPress={handlePlayPress}>
            <Box className="w-10 h-10 rounded-full bg-white items-center justify-center">
              {isCurrent && isPlaying ? (
                <Pause size={20} color={black} fill={black} />
              ) : (
                <Play size={20} color={black} fill={black} />
              )}
            </Box>
          </FadeOutScaleDown>
        </HStack>
      </VStack>
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
                  {seriesName || podcast?.podcastSeries?.name}
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
              {isFavorite || podcast?.podcastSeries?.isFavorite ? (
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
    </Pressable>
  );
}
