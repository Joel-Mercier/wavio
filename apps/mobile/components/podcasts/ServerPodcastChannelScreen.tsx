import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import PlayPauseButton from "@/components/PlayPauseButton";
import RichText from "@/components/RichText";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDeletePodcastChannel,
  useDeletePodcastEpisode,
  useGetPodcasts,
} from "@/hooks/backend/usePodcasts";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";
import {
  isPlayablePodcastEpisode,
  podcastEpisodeToTrack,
} from "@/utils/podcastEpisodeToTrack";

export default function ServerPodcastChannelScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const params = useLocalSearchParams<{
    id: string;
    title?: string;
    imageUrl?: string;
    coverArt?: string;
    url?: string;
    description?: string;
  }>();
  const { id } = params;

  const { data, isLoading } = useGetPodcasts({ id });
  const channel: PodcastChannel | undefined =
    data?.podcasts?.channel?.find((c) => c.id === id) ??
    data?.podcasts?.channel?.[0];

  const title = channel?.title || params.title || "";
  const description = channel?.description || params.description || "";
  const image =
    params.imageUrl ||
    channel?.originalImageUrl ||
    (channel?.coverArt || params.coverArt
      ? artworkUrl(channel?.coverArt || params.coverArt)
      : undefined);
  const episodes = useMemo(() => channel?.episode ?? [], [channel]);
  const colors = useImageColors(image);

  const scope = useCurrentAuthScope();
  const isFavorite = usePodcasts((store) =>
    store.favoritePodcasts.some((fav) => fav.uuid === id),
  );
  const addFavoriteServerPodcast = usePodcasts(
    (store) => store.addFavoriteServerPodcast,
  );
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const doDeletePodcastChannel = useDeletePodcastChannel();
  const doDeletePodcastEpisode = useDeletePodcastEpisode();

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [episodePendingDelete, setEpisodePendingDelete] =
    useState<PodcastEpisode | null>(null);

  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();

  const playableEpisodes = useMemo(
    () => episodes.filter(isPlayablePodcastEpisode),
    [episodes],
  );

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleToggleFavoritePress = () => {
    if (isFavorite) {
      removeFavoritePodcast(id);
    } else {
      const favoriteChannel: PodcastChannel =
        channel ??
        ({
          id,
          title: params.title,
          url: params.url ?? "",
          coverArt: params.coverArt,
          originalImageUrl: params.imageUrl,
          status: "completed",
        } as PodcastChannel);
      addFavoriteServerPodcast(favoriteChannel, scope);
    }
    toast.show({
      placement: "top",
      duration: 3000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {isFavorite
              ? t("app.podcasts.removeFromFavoritesSuccessMessage")
              : t("app.podcasts.addToFavoritesSuccessMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handlePlayEpisode = (episode: PodcastEpisode) => {
    if (playingTrack?.id === episode.id) {
      togglePlayPause();
      return;
    }
    const tracks = playableEpisodes.map((e) => podcastEpisodeToTrack(e, title));
    const start = Math.max(
      0,
      tracks.findIndex((track) => track.id === episode.id),
    );
    if (tracks.length > 0) {
      playTracks(tracks, start);
    }
  };

  const handleDeleteChannel = () => {
    doDeletePodcastChannel.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["podcasts"] });
          // The channel is gone — drop the local favorite if it exists.
          if (isFavorite) removeFavoritePodcast(id);
          router.back();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.podcasts.deleteChannelSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.podcasts.deleteChannelErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleDeleteEpisode = (episode: PodcastEpisode) => {
    doDeletePodcastEpisode.mutate(
      { id: episode.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["podcasts"] });
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.podcasts.deleteEpisodeSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.podcasts.deleteEpisodeErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const renderHeader = () => (
    <LinearGradient
      colors={[
        (colors?.platform === "ios" ? colors.primary : colors?.lightMuted) ||
          "#000",
        "#000",
      ]}
      style={{ paddingTop: insets.top, paddingHorizontal: 24 }}
    >
      <HStack className="mt-6 items-start justify-between">
        <FadeOutScaleDown
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
        >
          <ArrowLeft size={24} color={white} />
        </FadeOutScaleDown>
        <ImageWithFallback
          source={image ? { uri: image } : undefined}
          className="w-[60%] aspect-square rounded-md bg-primary-600"
          alt={title}
          contentFit="contain"
          fallback={
            <Box className="w-[60%] aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Podcast size={48} color={white} />
            </Box>
          }
        />
        <Box className="w-10" />
      </HStack>
      <VStack className="mt-5 pb-6">
        <Heading numberOfLines={2} className="text-white" size="2xl">
          {title}
        </Heading>
        {!!description && (
          <RichText numberOfLines={3} className="mt-2 text-primary-100">
            {description}
          </RichText>
        )}
        <HStack className="mt-4 items-center justify-between">
          <HStack className="items-center gap-x-4">
            <FadeOutScaleDown onPress={handlePresentModalPress}>
              <EllipsisVertical color={white} />
            </FadeOutScaleDown>
            <AnimatedHeart
              filled={isFavorite}
              onPress={handleToggleFavoritePress}
            />
          </HStack>
        </HStack>
        <Heading className="text-white mt-6" size="lg">
          {t("app.podcasts.tabEpisodes")}
        </Heading>
      </VStack>
    </LinearGradient>
  );

  return (
    <Box className="h-full bg-black">
      <FlashList
        data={episodes}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        renderItem={({ item }) => (
          <PodcastEpisodeRow
            episode={item}
            seriesName={title}
            isPlaying={playingTrack?.id === item.id && isPlaying}
            onPlayPress={() => handlePlayEpisode(item)}
            onDeletePress={() => setEpisodePendingDelete(item)}
          />
        )}
        ListEmptyComponent={() =>
          isLoading ? null : (
            <Box className="px-6 mt-8">
              <Text className="text-primary-100">
                {t("app.podcasts.noEpisodes")}
              </Text>
            </Box>
          )
        }
        contentContainerStyle={{
          paddingBottom: insets.bottom + bottomTabBarHeight,
        }}
        showsVerticalScrollIndicator={false}
      />
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <ImageWithFallback
                source={image ? { uri: image } : undefined}
                className="w-16 h-16 aspect-square rounded-md bg-primary-800"
                alt={title}
                contentFit="contain"
                fallback={
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <Podcast size={24} color={white} />
                  </Box>
                }
              />
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {title}
                </Heading>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowDeleteDialog(true);
                }}
              >
                <HStack className="items-center">
                  <Trash size={24} color={white} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.podcasts.deleteChannel")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.podcasts.deleteChannelConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.podcasts.deleteChannelConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => setShowDeleteDialog(false)}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                setShowDeleteDialog(false);
                handleDeleteChannel();
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={!!episodePendingDelete}
        onClose={() => setEpisodePendingDelete(null)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.podcasts.deleteEpisodeConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.podcasts.deleteEpisodeConfirmDescription")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => setEpisodePendingDelete(null)}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                const episode = episodePendingDelete;
                setEpisodePendingDelete(null);
                if (episode) handleDeleteEpisode(episode);
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.delete")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}

function PodcastEpisodeRow({
  episode,
  seriesName,
  isPlaying,
  onPlayPress,
  onDeletePress,
}: {
  episode: PodcastEpisode;
  seriesName: string;
  isPlaying: boolean;
  onPlayPress: () => void;
  onDeletePress: () => void;
}) {
  const [white, black] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
  ]) as string[];
  const { t } = useTranslation();
  const playable = isPlayablePodcastEpisode(episode);
  return (
    <VStack className="px-6 my-3 gap-y-2 border-b border-b-primary-400">
      <Heading className="text-white text-lg" numberOfLines={2}>
        {episode.title}
      </Heading>
      {!!episode.description && (
        <RichText className="text-primary-100" numberOfLines={2}>
          {episode.description}
        </RichText>
      )}
      <Text className="text-white">
        {episode.publishDate &&
          t("app.podcasts.publishedAt", {
            distance: formatDistanceToNow(new Date(episode.publishDate)),
          })}
        {episode.duration ? ` ⦁ ${secondsToMinutes(episode.duration)} min` : ""}
      </Text>
      <HStack className="items-center justify-between mb-4">
        <HStack className="flex-1 items-center gap-x-4">
          <FadeOutScaleDown onPress={onDeletePress}>
            <Trash size={22} color={white} />
          </FadeOutScaleDown>
          <Text className="flex-1 text-primary-100" numberOfLines={1}>
            {playable
              ? seriesName
              : t(`app.podcasts.episodeStatus.${episode.status}`)}
          </Text>
        </HStack>
        {playable && (
          <PlayPauseButton
            isPlaying={isPlaying}
            onPress={onPlayPress}
            size={40}
            iconSize={20}
            color={black}
            className="bg-white"
          />
        )}
      </HStack>
    </VStack>
  );
}
