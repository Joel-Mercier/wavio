import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import RadioIcon from "lucide-react-native/dist/esm/icons/radio.mjs";
import SkipBack from "lucide-react-native/dist/esm/icons/skip-back.mjs";
import SkipForward from "lucide-react-native/dist/esm/icons/skip-forward.mjs";
import Speaker from "lucide-react-native/dist/esm/icons/speaker.mjs";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { CastButton } from "react-native-google-cast";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import MovingText from "@/components/MovingText";
import PlayPauseButton from "@/components/PlayPauseButton";
import AudioQualityLine from "@/components/player/AudioQualityLine";
import CurrentLyricLine from "@/components/player/CurrentLyricLine";
import { openJukeboxSheet } from "@/components/player/jukeboxSheetController";
import PlaybackSlider from "@/components/player/PlaybackSlider";
import PlayerBookmarks from "@/components/player/PlayerBookmarks";
import PlayerSheets from "@/components/player/PlayerSheets";
import RepeatToggle from "@/components/RepeatToggle";
import ShuffleToggle from "@/components/ShuffleToggle";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { useStar, useUnstar } from "@/hooks/backend/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack, useSyncedLyrics } from "@/hooks/player";
import { useCastSync } from "@/hooks/player/useCastSync";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { skipNext, skipPrevious, togglePlayPause } from "@/services/player";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import usePodcasts from "@/stores/podcasts";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { cn } from "@/utils/tailwind";

const COVER_SWIPE_THRESHOLD = 80;
const COVER_SWIPE_BUFFER = 60;
const ICON_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };

function CoverSlot({
  track,
  size,
}: {
  track: QueueTrack | null;
  size: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  if (!size) return null;
  return (
    <ImageWithFallback
      size="none"
      source={track?.artwork ? { uri: track.artwork } : undefined}
      style={{ width: size, height: size, borderRadius: 6 }}
      contentFit={track?.isRadio ? "contain" : "cover"}
      alt="Track cover"
      fallback={
        <Box
          style={{ width: size, height: size }}
          className="rounded-md bg-primary-600 items-center justify-center"
        >
          {track?.isRadio ? (
            <RadioIcon size={64} color={white} />
          ) : (
            <AudioLines size={64} color={white} />
          )}
        </Box>
      }
    />
  );
}

export default function PlayerScreen() {
  const [blue500, emerald500, gray800] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-emerald-500",
    "--color-gray-800",
  ]) as string[];
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const capabilities = useCapabilities();
  const isOnline = useIsOnline();
  const router = useRouter();
  const toast = useToast();
  const actionsSheetRef = useRef<BottomSheetModal>(null);
  const jukeboxActive = useJukebox((s) => s.active);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const colors = useImageColors(playingTrack?.artwork);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const repeatMode = useQueue((store) => store.repeatMode);
  const setRepeatMode = useQueue((store) => store.setRepeatMode);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const currentIndex = useQueue((store) => store.currentIndex);
  const queueLength = useQueue((store) => store.queue.length);
  const source = useQueue((store) => store.source);
  const prevTrack = useQueue((store) =>
    store.currentIndex != null && store.currentIndex > 0
      ? store.queue[store.currentIndex - 1]
      : null,
  );
  const nextTrack = useQueue((store) =>
    store.currentIndex != null && store.currentIndex < store.queue.length - 1
      ? store.queue[store.currentIndex + 1]
      : null,
  );
  const isRadio = !!playingTrack?.isRadio;
  const isPodcast = playingTrack?.source === "podcast";
  const podcastSeries = isPodcast ? playingTrack?.podcastSeries : null;
  const showSource = !!source && !isPodcast && !isRadio;
  const sourceHref = useMemo<Href | null>(() => {
    if (!source?.id) return null;
    switch (source.type) {
      case "album":
        return `/albums/${source.id}`;
      case "playlist":
        return `/playlists/${source.id}`;
      case "artist":
        return `/artists/${source.id}`;
      case "folder":
        return {
          pathname: "/folders/[id]",
          params: { id: source.id, name: source.name },
        };
      default:
        return null;
    }
  }, [source]);
  const headerTextShadow = {
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  } as const;
  const topColor =
    (colors?.platform === "ios" ? colors.primary : colors?.muted) || blue500;
  const addFavoritePodcast = usePodcasts((store) => store.addFavoritePodcast);
  const removeFavoritePodcast = usePodcasts(
    (store) => store.removeFavoritePodcast,
  );
  const isPodcastFavorite = usePodcasts((store) =>
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
  const [coverArea, setCoverArea] = useState({ width: 0, height: 0 });
  const coverSize = Math.max(
    0,
    Math.min(coverArea.width - 48, coverArea.height),
  );
  const { lyrics } = useSyncedLyrics(playingTrack);
  const hasSyncedLyrics = !!lyrics && lyrics.line.length > 0;
  const coverTranslateX = useSharedValue(0);

  const coverRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: coverTranslateX.value }],
  }));

  const coverPanGesture = usePanGesture({
    activeOffsetX: [-15, 15],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      let tx = e.translationX;
      if (tx > 0 && !canSkipPrevious) return;
      if (tx < 0 && !canSkipNext) return;
      const max = coverArea.width + COVER_SWIPE_BUFFER;
      if (tx > max) tx = max;
      if (tx < -max) tx = -max;
      coverTranslateX.value = tx;
    },
    onDeactivate: (e) => {
      if (e.translationX <= -COVER_SWIPE_THRESHOLD && canSkipNext) {
        coverTranslateX.value = withTiming(
          -coverArea.width,
          { duration: 200 },
          (finished) => {
            if (finished) {
              coverTranslateX.value = 0;
              scheduleOnRN(skipNext);
            }
          },
        );
      } else if (e.translationX >= COVER_SWIPE_THRESHOLD && canSkipPrevious) {
        coverTranslateX.value = withTiming(
          coverArea.width,
          { duration: 200 },
          (finished) => {
            if (finished) {
              coverTranslateX.value = 0;
              scheduleOnRN(skipPrevious, { force: true });
            }
          },
        );
      } else {
        coverTranslateX.value = withTiming(0, { duration: 200 });
      }
    },
  });

  const castSession = useCastSync(playingTrack, isRadio);

  const handlePresentModalPress = useCallback(() => {
    actionsSheetRef.current?.present();
  }, []);

  const handleJukeboxPress = () => {
    openJukeboxSheet();
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
  };

  const handleNextPress = () => {
    skipNext();
  };

  const handlePreviousPress = () => {
    skipPrevious();
  };

  const handleFavoritePress = () => {
    if (!playingTrack?.id) return;
    const trackId = playingTrack.id;
    doFavorite.mutate(
      { id: trackId },
      {
        onSuccess: () => {
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
        onError: (error) => {
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
        onError: (error) => {
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

  const handleAddFavoritePodcastPress = () => {
    actionsSheetRef.current?.dismiss();
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

  const handleRemoveFavoritePodcastPress = () => {
    actionsSheetRef.current?.dismiss();
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

  const handleRepeatModePress = (newRepeatMode: typeof repeatMode) => {
    setRepeatMode(newRepeatMode);
  };

  const handleShufflePress = (enabled: boolean) => {
    setShuffle(enabled);
  };

  return (
    <LinearGradient
      colors={[topColor, "#191A1F"]}
      locations={[0, 0.7]}
      style={{ flex: 1 }}
    >
      <VStack
        className="flex-1"
        style={{
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <HStack
          className={cn(
            "items-center justify-between mb-4 px-6",
            !isWideLayout && "mt-4",
          )}
        >
          <FadeOutScaleDown
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <ChevronDown size={24} color="white" />
          </FadeOutScaleDown>
          <VStack className="items-center flex-1 mx-2">
            {showSource && source ? (
              <>
                <Text
                  className="text-white/70 text-[11px] font-medium uppercase tracking-wider"
                  numberOfLines={1}
                  style={headerTextShadow}
                >
                  {t(`app.player.playingFrom.${source.type}`)}
                </Text>
                <FadeOut
                  onPress={() => {
                    if (sourceHref) router.replace(sourceHref);
                  }}
                  className="flex-1 grow w-full"
                >
                  <MovingText>
                    <Text
                      className="text-white text-center font-bold tracking-wide"
                      style={headerTextShadow}
                    >
                      {source.name}
                    </Text>
                  </MovingText>
                </FadeOut>
              </>
            ) : (
              <Text
                className="text-white font-bold uppercase tracking-wider"
                style={headerTextShadow}
              >
                {t("app.player.title")}
              </Text>
            )}
          </VStack>
          <FadeOutScaleDown
            testID="player-menu-button"
            onPress={handlePresentModalPress}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <EllipsisVertical size={24} color="white" />
          </FadeOutScaleDown>
        </HStack>
        <VStack className={cn("flex-1", isWideLayout && "flex-row")}>
          <VStack className={cn("flex-1", isWideLayout && "mr-4")}>
            <Box
              className="flex-1 overflow-hidden mb-4"
              onLayout={(e) =>
                setCoverArea({
                  width: e.nativeEvent.layout.width,
                  height: e.nativeEvent.layout.height,
                })
              }
            >
              {coverSize > 0 && (
                <GestureDetector gesture={coverPanGesture}>
                  <Animated.View
                    style={[
                      { width: coverArea.width, height: coverArea.height },
                      coverRowStyle,
                    ]}
                  >
                    <Box
                      style={{
                        position: "absolute",
                        top: (coverArea.height - coverSize) / 2,
                        left: (coverArea.width - coverSize) / 2,
                      }}
                    >
                      <CoverSlot
                        track={playingTrack ?? null}
                        size={coverSize}
                      />
                    </Box>
                    <Box
                      style={{
                        position: "absolute",
                        top: (coverArea.height - coverSize) / 2,
                        left:
                          (coverArea.width - coverSize) / 2 - coverArea.width,
                      }}
                    >
                      <CoverSlot track={prevTrack} size={coverSize} />
                    </Box>
                    <Box
                      style={{
                        position: "absolute",
                        top: (coverArea.height - coverSize) / 2,
                        left:
                          (coverArea.width - coverSize) / 2 + coverArea.width,
                      }}
                    >
                      <CoverSlot track={nextTrack} size={coverSize} />
                    </Box>
                  </Animated.View>
                </GestureDetector>
              )}
            </Box>
            <CurrentLyricLine
              lyrics={hasSyncedLyrics ? lyrics : null}
              onPress={() => router.push("/lyrics")}
            />
          </VStack>
          <VStack className={cn(isWideLayout && "flex-1 justify-center")}>
            <VStack className="px-6">
              <HStack className="items-center justify-between gap-x-4">
                <VStack className="mb-2 flex-1">
                  <FadeOut
                    onPress={() => {
                      if (isPodcast) {
                        if (!playingTrack?.id) return;
                        router.replace({
                          pathname: "/podcasts/[id]",
                          params: {
                            id: playingTrack.id,
                            uuid: playingTrack.id,
                            name: playingTrack.title,
                            description: playingTrack.description,
                            imageUrl: playingTrack.artwork,
                            datePublished: playingTrack.datePublished,
                            duration: playingTrack.duration,
                            audioUrl: playingTrack.url,
                            websiteUrl: playingTrack.websiteUrl,
                            podcastSeries: JSON.stringify(
                              playingTrack.podcastSeries,
                            ),
                          },
                        });
                        return;
                      }
                      if (!playingTrack?.albumId) return;
                      router.replace(`/albums/${playingTrack.albumId}`);
                    }}
                  >
                    <MovingText>
                      <Text className="text-white text-2xl font-bold font-heading">
                        {playingTrack?.title}
                      </Text>
                    </MovingText>
                  </FadeOut>
                  <FadeOut
                    onPress={() => {
                      if (isPodcast) {
                        if (!podcastSeries?.uuid) return;
                        router.replace({
                          pathname: "/podcast-series/[id]",
                          params: {
                            id: podcastSeries.uuid,
                            uuid: podcastSeries.uuid,
                            name: podcastSeries.name,
                            description: podcastSeries.description,
                            imageUrl: podcastSeries.imageUrl,
                            authorName: podcastSeries.authorName,
                            genres: podcastSeries.genres?.join(","),
                          },
                        });
                        return;
                      }
                      if (!playingTrack?.artistId) return;
                      router.replace(`/artists/${playingTrack.artistId}`);
                    }}
                  >
                    <Text className="text-white/80 text-lg">
                      {playingTrack?.artist ||
                        (!isPodcast && !isRadio
                          ? t("app.shared.unknownArtist")
                          : "")}
                    </Text>
                  </FadeOut>
                </VStack>
                {!isRadio && isPodcast && podcastSeries && (
                  <AnimatedHeart
                    filled={isPodcastFavorite}
                    hitSlop={ICON_HIT_SLOP}
                    onPress={
                      isPodcastFavorite
                        ? handleRemoveFavoritePodcastPress
                        : handleAddFavoritePodcastPress
                    }
                  />
                )}
                {!isRadio && !isPodcast && (
                  <AnimatedHeart
                    testID="player-favorite-button"
                    filled={!!playingTrack?.starred}
                    disabled={!isOnline}
                    hitSlop={ICON_HIT_SLOP}
                    onPress={
                      playingTrack?.starred
                        ? handleUnfavoritePress
                        : handleFavoritePress
                    }
                  />
                )}
              </HStack>
              {!isRadio && <AudioQualityLine track={playingTrack ?? null} />}
              {!isRadio && <PlaybackSlider />}
              {isRadio && <Box className="mb-6" />}
              <HStack
                className={
                  isRadio
                    ? "items-center justify-center"
                    : "items-center justify-between"
                }
              >
                {!isRadio && (
                  <ShuffleToggle
                    active={shuffle}
                    hitSlop={ICON_HIT_SLOP}
                    onPress={() => handleShufflePress(!shuffle)}
                  />
                )}
                {!isRadio && (
                  <FadeOut
                    testID="player-previous-button"
                    onPress={handlePreviousPress}
                  >
                    <SkipBack size={36} color="white" fill="white" />
                  </FadeOut>
                )}
                <PlayPauseButton
                  testID="player-play-pause-button"
                  isPlaying={isPlaying}
                  onPress={handlePlayPausePress}
                  size={64}
                  iconSize={24}
                  color={gray800}
                  className="bg-white"
                />
                {!isRadio && (
                  <FadeOut
                    testID="player-next-button"
                    onPress={handleNextPress}
                  >
                    <SkipForward size={36} color="white" fill="white" />
                  </FadeOut>
                )}
                {!isRadio && (
                  <RepeatToggle
                    mode={repeatMode}
                    hitSlop={ICON_HIT_SLOP}
                    onPress={() =>
                      handleRepeatModePress(
                        repeatMode === "off"
                          ? "all"
                          : repeatMode === "all"
                            ? "one"
                            : "off",
                      )
                    }
                  />
                )}
              </HStack>
              {!isRadio && <PlayerBookmarks />}
              <HStack
                className={cn(
                  "items-center justify-between",
                  isWideLayout ? "mt-2 mb-2" : "mt-4 mb-6",
                )}
              >
                <CastButton
                  hitSlop={ICON_HIT_SLOP}
                  style={{ width: 24, height: 24, tintColor: "white" }}
                />
                {capabilities.jukebox && !isRadio && !castSession && (
                  <FadeOut
                    hitSlop={ICON_HIT_SLOP}
                    onPress={handleJukeboxPress}
                    disabled={!isOnline}
                  >
                    <Speaker
                      size={24}
                      color={jukeboxActive ? emerald500 : "white"}
                    />
                    {jukeboxActive && (
                      <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                        <Box className="bg-emerald-500 rounded-full size-1" />
                      </Box>
                    )}
                  </FadeOut>
                )}
                <FadeOut
                  testID="player-queue-button"
                  hitSlop={ICON_HIT_SLOP}
                  onPress={() => router.replace("/queue")}
                >
                  <ListMusic size={24} color="white" />
                </FadeOut>
              </HStack>
            </VStack>
          </VStack>
        </VStack>
      </VStack>
      <PlayerSheets
        actionsSheetRef={actionsSheetRef}
        playingTrack={playingTrack ?? null}
        onAddFavoritePodcast={handleAddFavoritePodcastPress}
        onRemoveFavoritePodcast={handleRemoveFavoritePodcastPress}
      />
    </LinearGradient>
  );
}
