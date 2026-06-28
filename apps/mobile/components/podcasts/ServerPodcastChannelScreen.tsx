import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { secondsToMinutes } from "date-fns/secondsToMinutes";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import CircleCheckBig from "lucide-react-native/dist/esm/icons/circle-check-big.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Trash from "lucide-react-native/dist/esm/icons/trash.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import CollapsibleTabs, {
  type CollapsibleSceneProps,
} from "@/components/CollapsibleTabs";
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
import {
  useDownloadProgress,
  useIsTrackAvailableOffline,
} from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import useImageColors from "@/hooks/useImageColors";
import { parseLocalPodcastEpisodeId } from "@/services/local/keys";
import { offlineDownloadService } from "@/services/offline";
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import { playTracks, togglePlayPause } from "@/services/player";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import usePodcasts, { podcastFavoritesForScope } from "@/stores/podcasts";
import { artworkUrl } from "@/utils/artwork";
import { formatDistanceToNow } from "@/utils/date";
import { goBackOrHome } from "@/utils/navigation";
import {
  isPlayablePodcastEpisode,
  podcastEpisodeToTrack,
} from "@/utils/podcastEpisodeToTrack";

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

const APP_BAR_ROW_HEIGHT = 56;
const TAB_BAR_HEIGHT = 48;

export default function ServerPodcastChannelScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
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
  // Server-assigned channel ids can collide across servers — only a favorite
  // from the active scope counts.
  const isFavorite = usePodcasts((store) =>
    podcastFavoritesForScope(store.favoritePodcasts, scope).some(
      (fav) => fav.uuid === id,
    ),
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

  const scrollY = useSharedValue(0);
  const appBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
  }));
  const minTopInset = insets.top + APP_BAR_ROW_HEIGHT;

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
          goBackOrHome(router);
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
      locations={[0, 1]}
      style={{ paddingTop: minTopInset, paddingHorizontal: 24 }}
    >
      <VStack className="pt-2 pb-6">
        <HStack className="items-center gap-x-4">
          <ImageWithFallback
            source={image ? { uri: image } : undefined}
            className="w-32 h-32 rounded-md aspect-square bg-primary-800"
            alt={title}
            contentFit="cover"
            fallback={
              <Box className="w-32 h-32 aspect-square rounded-md bg-primary-800 items-center justify-center">
                <Podcast size={24} color={white} />
              </Box>
            }
          />
          <VStack className="flex-1">
            <Heading
              numberOfLines={3}
              className="text-white font-bold"
              size="xl"
            >
              {title}
            </Heading>
            {!!channel?.author && (
              <Text className="text-white mt-1" numberOfLines={1}>
                {channel.author}
              </Text>
            )}
          </VStack>
        </HStack>
        <HStack className="mt-4 items-center gap-x-4">
          <FadeOutScaleDown
            onPress={handleToggleFavoritePress}
            className="border border-white rounded-full self-start py-1 px-2.5"
          >
            <Text className="text-white">
              {isFavorite
                ? t("app.podcasts.unsubscribe")
                : t("app.podcasts.subscribe")}
            </Text>
          </FadeOutScaleDown>
          <FadeOutScaleDown
            testID="podcast-channel-menu-button"
            onPress={handlePresentModalPress}
          >
            <EllipsisVertical color={white} />
          </FadeOutScaleDown>
        </HStack>
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
      data={episodes}
      keyExtractor={(item) => item.id}
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
        paddingTop: contentTopInset,
        paddingBottom: insets.bottom + bottomTabBarHeight + floatingPlayerInset,
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
        paddingBottom: insets.bottom + bottomTabBarHeight + floatingPlayerInset,
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
        style={[appBarStyle]}
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
              {title}
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
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <ImageWithFallback
                source={image ? { uri: image } : undefined}
                className="w-16 h-16 aspect-square rounded-md bg-primary-800"
                alt={title}
                contentFit="cover"
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
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
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
  const [white, black, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const toast = useToast();
  const playable = isPlayablePodcastEpisode(episode);

  // Self-hosted (local) episodes stream from a remote enclosure URL and can be
  // downloaded on-device for offline playback through the shared offline
  // pipeline. The episode id encodes that URL (see services/local/keys.ts), so
  // its presence is the precise "downloadable on this device" signal.
  const downloadable =
    episode.streamId != null &&
    parseLocalPodcastEpisodeId(episode.streamId) != null;
  const isDownloaded = useIsTrackAvailableOffline(episode.id);
  const progress = useDownloadProgress(episode.id);
  const isDownloading =
    progress?.status === "downloading" || progress?.status === "pending";

  const handleDownloadPress = async () => {
    try {
      await offlineDownloadService.downloadTrack({
        ...episode,
        artist: episode.artist || seriesName,
      });
    } catch {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.podcasts.downloadEpisodeErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  const renderDownloadControl = () => {
    if (!downloadable) return null;
    if (isDownloaded) {
      return (
        <FadeOutScaleDown
          onPress={() =>
            offlineDownloadService.removeDownloadedTrack(episode.id)
          }
        >
          <CircleCheckBig size={22} color={emerald} />
        </FadeOutScaleDown>
      );
    }
    if (isDownloading) {
      return (
        <Text className="text-primary-100 text-sm">
          {`${Math.round(progress?.progress ?? 0)}%`}
        </Text>
      );
    }
    return (
      <FadeOutScaleDown onPress={handleDownloadPress}>
        <Download size={22} color={white} />
      </FadeOutScaleDown>
    );
  };

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
        <HStack className="items-center gap-x-4">
          {renderDownloadControl()}
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
      </HStack>
    </VStack>
  );
}
