import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import SkipForward from "lucide-react-native/dist/esm/icons/skip-forward.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import { useTranslation } from "react-i18next";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import ImageWithFallback from "@/components/ImageWithFallback";
import MovingText from "@/components/MovingText";
import { OFFLINE_BANNER_HEIGHT } from "@/components/OfflineBanner";
import PlayPauseButton from "@/components/PlayPauseButton";
import { openJukeboxSheet } from "@/components/player/jukeboxSheetController";
import PlaybackProgressBar from "@/components/player/PlaybackProgressBar";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useStar, useUnstar } from "@/hooks/backend/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { skipNext, skipPrevious, togglePlayPause } from "@/services/player";
import type { PodcastSeries } from "@/services/taddyPodcasts/types";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import usePodcasts from "@/stores/podcasts";
import useQueue from "@/stores/queue";
import { invalidateKeys } from "@/utils/invalidateKeys";

export const FLOATING_PLAYER_HEIGHT = 64;
// Width of the landscape left tab bar column; the player docks to its bottom.
export const SIDEBAR_WIDTH = 240;

const SWIPE_THRESHOLD = 80;
const MAX_TRANSLATE = 140;

export default function FloatingPlayer() {
  const { t } = useTranslation();
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const router = useRouter();
  const pathname = usePathname();
  const colors = useImageColors(playingTrack?.artwork);
  const toast = useToast();
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const [white, primary, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-primary-500",
    "--color-emerald-500",
  ]) as string[];
  const capabilities = useCapabilities();
  const jukeboxActive = useJukebox((s) => s.active);
  const queueLength = useQueue((s) => s.queue.length);
  const currentIndex = useQueue((s) => s.currentIndex);
  const repeatMode = useQueue((s) => s.repeatMode);
  const shuffle = useQueue((s) => s.shuffle);
  const queryClient = useQueryClient();

  const isRadio = !!playingTrack?.isRadio;
  const isPodcast = playingTrack?.source === "podcast";
  const podcastSeries = (
    isPodcast ? playingTrack?.podcastSeries : null
  ) as PodcastSeries | null;
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const isPodcastSeriesFavorite = usePodcasts((store) =>
    podcastSeries
      ? store.favoritePodcasts.some((fav) => fav.uuid === podcastSeries.uuid)
      : false,
  );
  const canSkipNext =
    !isRadio &&
    (shuffle ||
      repeatMode !== "off" ||
      (currentIndex != null && currentIndex < queueLength - 1));
  const canSkipPrevious =
    !isRadio &&
    (shuffle ||
      repeatMode !== "off" ||
      (currentIndex != null && currentIndex > 0));

  const translateX = useSharedValue(0);

  const handlePress = () => {
    router.navigate("/player");
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
  };

  const handleAddPodcastFavoritePress = () => {
    if (!podcastSeries) return;
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

  const handleRemovePodcastFavoritePress = () => {
    if (!podcastSeries) return;
    removeFavoritePodcast(podcastSeries.uuid);
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

  const handleFavoritePress = () => {
    if (!playingTrack?.id) return;
    const trackId = playingTrack.id;
    const starredAt = new Date().toISOString();
    doFavorite.mutate(
      { id: trackId },
      {
        onSuccess: () => {
          const starredTrack = { ...playingTrack, starred: starredAt };
          queryClient.setQueriesData<{
            // biome-ignore lint/suspicious/noExplicitAny: cached subsonic response shape varies
            "subsonic-response"?: any;
          }>({ predicate: (q) => q.queryKey[0] === "starred2" }, (old) => {
            const body = old?.["subsonic-response"];
            if (!body?.starred2) return old;
            const existing = body.starred2.song ?? [];
            if (existing.some((s: { id: string }) => s.id === trackId))
              return old;
            return {
              ...old,
              "subsonic-response": {
                ...body,
                starred2: {
                  ...body.starred2,
                  song: [starredTrack, ...existing],
                },
              },
            };
          });
          invalidateKeys(queryClient, [
            ["starred2"],
            ["starred"],
            ["album"],
            ["search3"],
          ]);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.favoriteSuccessMessage")}
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
                  {t("app.tracks.favoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleUnfavoritePress = () => {
    if (!playingTrack?.id) return;
    const trackId = playingTrack.id;
    doUnfavorite.mutate(
      { id: trackId },
      {
        onSuccess: () => {
          queryClient.setQueriesData<{
            // biome-ignore lint/suspicious/noExplicitAny: cached subsonic response shape varies
            "subsonic-response"?: any;
          }>({ predicate: (q) => q.queryKey[0] === "starred2" }, (old) => {
            const body = old?.["subsonic-response"];
            if (!body?.starred2) return old;
            return {
              ...old,
              "subsonic-response": {
                ...body,
                starred2: {
                  ...body.starred2,
                  song: body.starred2.song?.filter(
                    (s: { id: string }) => s.id !== trackId,
                  ),
                },
              },
            };
          });
          invalidateKeys(queryClient, [
            ["starred2"],
            ["starred"],
            ["album"],
            ["search3"],
          ]);
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.unfavoriteSuccessMessage")}
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
                  {t("app.tracks.unfavoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const textStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:
      Math.abs(translateX.value) >= SWIPE_THRESHOLD
        ? 0.5
        : 1 - Math.abs(translateX.value) / (SWIPE_THRESHOLD * 2.5),
  }));

  const panGesture = usePanGesture({
    activeOffsetX: [-15, 15],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      let tx = e.translationX;
      if (tx > 0 && !canSkipPrevious) return;
      if (tx < 0 && !canSkipNext) return;
      if (tx > MAX_TRANSLATE) tx = MAX_TRANSLATE;
      if (tx < -MAX_TRANSLATE) tx = -MAX_TRANSLATE;
      translateX.value = tx;
    },
    onDeactivate: (e) => {
      if (e.translationX <= -SWIPE_THRESHOLD && canSkipNext) {
        scheduleOnRN(skipNext);
      } else if (e.translationX >= SWIPE_THRESHOLD && canSkipPrevious) {
        scheduleOnRN(skipPrevious, { force: true });
      }
      translateX.value = withTiming(0, { duration: 180 });
    },
  });

  if (
    !playingTrack ||
    pathname.startsWith("/player") ||
    pathname.startsWith("/playlists/new") ||
    pathname.includes("/edit-rules") ||
    pathname.startsWith("/internet-radio-stations/new")
  ) {
    return null;
  }

  const backgroundColor =
    (colors?.platform === "ios" ? colors.background : colors?.muted) || primary;

  if (isWideLayout) {
    return (
      <Pressable
        testID="floating-player"
        className="absolute left-0 bottom-0"
        style={{
          width: SIDEBAR_WIDTH,
          // Match the sidebar's own start padding so the player clears a
          // landscape left cutout (what is the top inset in portrait).
          paddingLeft: insets.left,
          bottom: insets.bottom + 12 + (isOnline ? 0 : OFFLINE_BANNER_HEIGHT),
        }}
        onPress={handlePress}
      >
        <VStack className="relative mx-2 px-2 pt-3 pb-2 gap-y-3">
          <PlaybackProgressBar position="top" />
          <HStack className="items-center gap-x-2">
            <ImageWithFallback
              source={
                playingTrack.artwork ? { uri: playingTrack.artwork } : undefined
              }
              className="w-10 h-10 rounded aspect-square"
              alt="Track cover"
              contentFit={playingTrack.isRadio ? "contain" : "cover"}
              fallback={
                <Box className="w-10 h-10 rounded bg-primary-600 items-center justify-center">
                  <AudioLines size={20} color={white} />
                </Box>
              }
            />
            <VStack className="flex-1">
              <MovingText>
                <Text className="text-white font-bold text-sm">
                  {playingTrack.title || ""}
                </Text>
              </MovingText>
              <Text numberOfLines={1} className="text-gray-300 text-xs">
                {playingTrack.artist ||
                  (!isRadio && !isPodcast ? t("app.shared.unknownArtist") : "")}
              </Text>
            </VStack>
            {!isRadio && isPodcast && podcastSeries && (
              <AnimatedHeart
                hitSlop={8}
                filled={isPodcastSeriesFavorite}
                onPress={
                  isPodcastSeriesFavorite
                    ? handleRemovePodcastFavoritePress
                    : handleAddPodcastFavoritePress
                }
              />
            )}
            {!isRadio && !isPodcast && (
              <AnimatedHeart
                hitSlop={8}
                filled={!!playingTrack.starred}
                disabled={!isOnline}
                onPress={
                  playingTrack.starred
                    ? handleUnfavoritePress
                    : handleFavoritePress
                }
              />
            )}
          </HStack>
          <HStack className="items-center justify-between">
            {capabilities.jukebox && !isRadio && !isPodcast ? (
              <Pressable
                hitSlop={8}
                disabled={!isOnline}
                style={{ opacity: isOnline ? 1 : 0.6 }}
                onPress={(e) => {
                  e.stopPropagation?.();
                  openJukeboxSheet();
                }}
              >
                <Speaker size={20} color={jukeboxActive ? emerald500 : white} />
              </Pressable>
            ) : (
              <Box className="w-5" />
            )}
            <PlayPauseButton
              testID="floating-player-play-pause"
              isPlaying={isPlaying}
              onPress={handlePlayPausePress}
              size={40}
              iconSize={20}
              className="bg-white"
              hitSlop={8}
            />
            {!isRadio ? (
              <Pressable
                hitSlop={8}
                disabled={!canSkipNext}
                style={{ opacity: canSkipNext ? 1 : 0.4 }}
                onPress={(e) => {
                  e.stopPropagation?.();
                  skipNext();
                }}
              >
                <SkipForward size={20} color={white} fill={white} />
              </Pressable>
            ) : (
              <Box className="w-5" />
            )}
          </HStack>
        </VStack>
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Pressable
        testID="floating-player"
        className={
          isWideLayout ? "absolute left-0 bottom-0" : "absolute right-0 left-0"
        }
        style={
          isWideLayout
            ? {
                width: SIDEBAR_WIDTH,
                bottom: insets.bottom + (isOnline ? 0 : OFFLINE_BANNER_HEIGHT),
              }
            : { bottom: 96 + (isOnline ? 0 : OFFLINE_BANNER_HEIGHT) }
        }
        onPress={handlePress}
      >
        <HStack
          className="h-16 mx-2 px-4 py-2 rounded-md items-center justify-between overflow-hidden"
          style={{
            backgroundColor: backgroundColor,
          }}
        >
          <HStack className="items-center flex-1">
            <Box style={{ zIndex: 2 }} className="rounded-md">
              <ImageWithFallback
                source={
                  playingTrack.artwork
                    ? { uri: playingTrack.artwork }
                    : undefined
                }
                className="w-12 h-12 rounded-md aspect-square"
                alt="Track cover"
                contentFit={playingTrack.isRadio ? "contain" : "cover"}
                fallback={
                  <Box className="w-12 h-12 rounded-md bg-primary-600 items-center justify-center">
                    <AudioLines size={24} color={white} />
                  </Box>
                }
              />
            </Box>

            <Animated.View
              style={[textStyle, { zIndex: 1 }]}
              className="ml-4 flex-1"
            >
              <MovingText>
                <Text className="text-white font-bold text-md">
                  {playingTrack.title || ""}
                </Text>
              </MovingText>
              <Text numberOfLines={1} className="text-gray-300">
                {playingTrack.artist ||
                  (!isRadio && !isPodcast ? t("app.shared.unknownArtist") : "")}
              </Text>
            </Animated.View>
          </HStack>
          <HStack className="items-center pl-4 gap-4" style={{ zIndex: 2 }}>
            {capabilities.jukebox && !isRadio && !isPodcast && (
              <Pressable
                hitSlop={12}
                disabled={!isOnline}
                style={{ opacity: isOnline ? 1 : 0.6 }}
                onPress={(e) => {
                  e.stopPropagation?.();
                  openJukeboxSheet();
                }}
              >
                <Speaker size={24} color={jukeboxActive ? emerald500 : white} />
              </Pressable>
            )}
            {!playingTrack.isRadio && isPodcast && podcastSeries && (
              <AnimatedHeart
                hitSlop={12}
                filled={isPodcastSeriesFavorite}
                onPress={
                  isPodcastSeriesFavorite
                    ? handleRemovePodcastFavoritePress
                    : handleAddPodcastFavoritePress
                }
              />
            )}
            {!playingTrack.isRadio && !isPodcast && (
              <AnimatedHeart
                hitSlop={12}
                filled={!!playingTrack.starred}
                disabled={!isOnline}
                onPress={
                  playingTrack.starred
                    ? handleUnfavoritePress
                    : handleFavoritePress
                }
              />
            )}
            <PlayPauseButton
              testID="floating-player-play-pause"
              isPlaying={isPlaying}
              onPress={handlePlayPausePress}
              size={24}
              iconSize={24}
              color={white}
              hitSlop={12}
            />
          </HStack>
          <Box className="absolute inset-0 bg-black/30 -z-10" />
          <PlaybackProgressBar />
        </HStack>
      </Pressable>
    </GestureDetector>
  );
}
