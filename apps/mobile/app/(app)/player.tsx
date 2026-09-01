import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { type Href, useIsFocused, useRouter } from "expo-router";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import Captions from "lucide-react-native/dist/esm/icons/captions.mjs";
import Cast from "lucide-react-native/dist/esm/icons/cast.mjs";
import ChevronDown from "lucide-react-native/dist/esm/icons/chevron-down.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import Mic2 from "lucide-react-native/dist/esm/icons/mic-vocal.mjs";
import RadioIcon from "lucide-react-native/dist/esm/icons/radio.mjs";
import SkipBack from "lucide-react-native/dist/esm/icons/skip-back.mjs";
import SkipForward from "lucide-react-native/dist/esm/icons/skip-forward.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
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
import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import MovingText from "@/components/MovingText";
import PlayPauseButton from "@/components/PlayPauseButton";
import AudioQualityLine from "@/components/player/AudioQualityLine";
import CurrentLyricLine from "@/components/player/CurrentLyricLine";
import LyricsBody from "@/components/player/LyricsBody";
import { openOutputSheet } from "@/components/player/OutputSheet";
import PlaybackSlider from "@/components/player/PlaybackSlider";
import PlayerBookmarks from "@/components/player/PlayerBookmarks";
import PlayerSheets from "@/components/player/PlayerSheets";
import PodcastSeekButton from "@/components/player/PodcastSeekButton";
import RepeatToggle from "@/components/RepeatToggle";
import ShuffleToggle from "@/components/ShuffleToggle";
import StarRating from "@/components/StarRating";
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
import {
  useSetRating,
  useStar,
  useUnstar,
} from "@/hooks/backend/useMediaAnnotation";
import { useIsPlaying, usePlayingTrack, useSyncedLyrics } from "@/hooks/player";
import { useCapabilities } from "@/hooks/useCapabilities";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useKeepScreenAwake } from "@/hooks/useKeepScreenAwake";
import { useTrackArtwork } from "@/hooks/useTrackArtwork";
import {
  PODCAST_SEEK_BACKWARD_SECONDS,
  PODCAST_SEEK_FORWARD_SECONDS,
  seekBy,
  skipNext,
  skipPrevious,
  togglePlayPause,
} from "@/services/player";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import usePodcasts from "@/stores/podcasts";
import useQueue, { type QueueTrack } from "@/stores/queue";
import useUpnp from "@/stores/upnp";
import { formatAudioQuality } from "@/utils/audioQuality";
import { hasLyricContent, isSyncedLyrics } from "@/utils/lyrics";
import { cn } from "@/utils/tailwind";

const COVER_SWIPE_THRESHOLD = 80;
const COVER_SWIPE_BUFFER = 60;
const ICON_HIT_SLOP = { top: 16, bottom: 16, left: 16, right: 16 };
const LYRICS_FADE_MS = 250;

function CoverSlot({
  track,
  size,
}: {
  track: QueueTrack | null;
  size: number;
}) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const artwork = useTrackArtwork(track);
  if (!size) return null;
  return (
    <ImageWithFallback
      size="none"
      source={artwork ? { uri: artwork } : undefined}
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
  const [black, blue500, emerald500, gray800] = Uniwind.getCSSVariable([
    "--color-black",
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
  const speedSheetRef = useRef<BottomSheetModal>(null);
  const lyricsPickerSheetRef = useRef<BottomSheetModal>(null);
  const jukeboxActive = useJukebox((s) => s.active);
  const upnpConnected = useUpnp((s) => s.connected);
  // One indicator for every output: the button says "not this phone", and the
  // sheet says which one.
  const playingRemotely = jukeboxActive || upnpConnected;
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const playingArtwork = useTrackArtwork(playingTrack);
  const colors = useImageColors(playingArtwork);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const doSetRating = useSetRating();
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
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || blue500;
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
    (repeatMode !== "off" ||
      (currentIndex != null && currentIndex < queueLength - 1));
  const canSkipPrevious =
    !isRadio &&
    (repeatMode !== "off" || (currentIndex != null && currentIndex > 0));
  const [coverArea, setCoverArea] = useState({ width: 0, height: 0 });
  const coverSize = Math.max(
    0,
    Math.min(coverArea.width - 48, coverArea.height),
  );
  const lyricsSource = useApp((s) => s.lyricsSource);
  const lyricsKeepScreenOn = useApp((s) => s.lyricsKeepScreenOn);
  const inlineLyricsEnabled = useApp((s) => s.playerInlineLyrics);
  const setPlayerInlineLyrics = useApp((s) => s.setPlayerInlineLyrics);
  const podcastPlaybackRate = useApp((s) => s.podcastPlaybackRate);
  const showPlayerRating = useApp((s) => s.showPlayerRating);
  const showRating =
    showPlayerRating && capabilities.setRating && !isRadio && !isPodcast;
  // Mirrors AudioQualityLine's own null check so the row (and its bottom
  // margin) collapses when there is neither a quality line nor a rating.
  const hasQualityLine = !!formatAudioQuality(playingTrack ?? null);
  const {
    lyrics,
    hasKaraoke,
    layers,
    isLoading: lyricsLoading,
  } = useSyncedLyrics(playingTrack);
  const hasSyncedLyrics = isSyncedLyrics(lyrics);
  // The toggle preference survives tracks that have no lyrics to show: the
  // cover comes back on its own and the inline view returns with the next
  // track that does have them. Loading counts as "can show" so skipping tracks
  // doesn't bounce back to the cover for the length of each fetch.
  const canShowInlineLyrics =
    lyricsSource !== "off" &&
    !isRadio &&
    !isPodcast &&
    (hasLyricContent(lyrics) || lyricsLoading);
  const showInlineLyrics = inlineLyricsEnabled && canShowInlineLyrics;
  const coverTranslateX = useSharedValue(0);

  // LyricsBody renders every line un-virtualized inside a MaskedView, so it is
  // mounted only while visible — kept alive through the fade-out, then dropped.
  // The focus check covers the full-screen /lyrics route, which leaves the
  // player mounted underneath: without it both instances would re-render their
  // whole line list on every line advance.
  const isFocused = useIsFocused();
  const [lyricsMounted, setLyricsMounted] = useState(showInlineLyrics);
  const lyricsOpacity = useSharedValue(showInlineLyrics ? 1 : 0);
  const coverOpacity = useSharedValue(showInlineLyrics ? 0 : 1);

  useEffect(() => {
    if (showInlineLyrics) setLyricsMounted(true);
    lyricsOpacity.value = withTiming(showInlineLyrics ? 1 : 0, {
      duration: LYRICS_FADE_MS,
    });
    coverOpacity.value = withTiming(
      showInlineLyrics ? 0 : 1,
      { duration: LYRICS_FADE_MS },
      (finished) => {
        if (finished && !showInlineLyrics) {
          scheduleOnRN(setLyricsMounted, false);
        }
      },
    );
  }, [showInlineLyrics, lyricsOpacity, coverOpacity]);

  const coverFadeStyle = useAnimatedStyle(() => ({
    opacity: coverOpacity.value,
  }));

  const lyricsFadeStyle = useAnimatedStyle(() => ({
    opacity: lyricsOpacity.value,
  }));

  const coverRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: coverTranslateX.value }],
  }));

  const coverPanGesture = usePanGesture({
    enabled: !showInlineLyrics,
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

  // Distinct tag from the /lyrics screen's: this screen stays mounted under it,
  // so a shared tag would let one screen's cleanup cancel the other's request.
  useKeepScreenAwake(
    lyricsKeepScreenOn && isPlaying && showInlineLyrics,
    "player-lyrics",
  );

  const handlePresentModalPress = useCallback(() => {
    actionsSheetRef.current?.present();
  }, []);

  const handleOutputPress = () => {
    openOutputSheet();
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

  const handleSeekBackwardPress = () => {
    seekBy(-PODCAST_SEEK_BACKWARD_SECONDS);
  };

  const handleSeekForwardPress = () => {
    seekBy(PODCAST_SEEK_FORWARD_SECONDS);
  };

  const handleSpeedPress = () => {
    speedSheetRef.current?.present();
  };

  const handleLyricsPickerPress = () => {
    lyricsPickerSheetRef.current?.present();
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

  // Returns the mutation promise so StarRating can roll back its optimistic
  // fill when the save is rejected.
  const handleRatingChange = async (rating: number) => {
    if (!playingTrack?.id) return;
    try {
      await doSetRating.mutateAsync({ id: playingTrack.id, rating });
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.rateSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch (error) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.rateErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
      throw error;
    }
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
                  className="w-full"
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
                <Animated.View
                  style={[StyleSheet.absoluteFill, coverFadeStyle]}
                  pointerEvents={showInlineLyrics ? "none" : "auto"}
                >
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
                </Animated.View>
              )}
              {lyricsMounted && isFocused && (
                <Animated.View
                  style={[StyleSheet.absoluteFill, lyricsFadeStyle]}
                  pointerEvents={showInlineLyrics ? "auto" : "none"}
                >
                  <LyricsBody
                    lyrics={lyrics}
                    layers={layers}
                    isLoading={lyricsLoading}
                  />
                </Animated.View>
              )}
            </Box>
            {/* The slot is reserved on every lyrics-capable track, whether or
                not this one has lyrics: letting it collapse would re-measure
                coverArea and resize the cover — a visible jump when lyrics
                land, when a track has none, or mid-fade while the next track's
                are still loading. */}
            {!isRadio &&
              !isPodcast &&
              lyricsSource !== "off" &&
              (showInlineLyrics || !hasSyncedLyrics ? (
                <Box className="h-12" />
              ) : (
                <CurrentLyricLine
                  lyrics={lyrics}
                  onPress={() => setPlayerInlineLyrics(true)}
                />
              ))}
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
                    <MovingText>
                      <Text className="text-white/80 text-lg">
                        {playingTrack?.artist ||
                          (!isPodcast && !isRadio
                            ? t("app.shared.unknownArtist")
                            : "")}
                      </Text>
                    </MovingText>
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
                    hitSlop={ICON_HIT_SLOP}
                    onPress={
                      playingTrack?.starred
                        ? handleUnfavoritePress
                        : handleFavoritePress
                    }
                  />
                )}
              </HStack>
              {!isRadio && (hasQualityLine || showRating) && (
                <HStack className="items-center justify-between gap-x-3 mb-4">
                  <Box className="flex-1">
                    <AudioQualityLine track={playingTrack ?? null} />
                  </Box>
                  {showRating && (
                    <StarRating
                      testID="player-star-rating"
                      value={playingTrack?.userRating ?? 0}
                      onChange={handleRatingChange}
                      size={18}
                      spacing={4}
                      emptyColor="rgba(255,255,255,0.4)"
                    />
                  )}
                </HStack>
              )}
              {!isRadio && <PlaybackSlider allowWaveform />}
              {isRadio && <Box className="mb-6" />}
              <HStack
                className={
                  isRadio
                    ? "items-center justify-center"
                    : "items-center justify-between"
                }
              >
                {/* Podcasts swap shuffle/repeat — meaningless for an episode —
                    for the relative seeks, and demote prev/next episode to the
                    outer slots so the seeks sit under the thumb. */}
                {!isRadio && !isPodcast && (
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
                    <SkipBack
                      size={isPodcast ? 28 : 36}
                      color="white"
                      fill="white"
                    />
                  </FadeOut>
                )}
                {isPodcast && (
                  <PodcastSeekButton
                    testID="player-seek-backward-button"
                    direction="backward"
                    seconds={PODCAST_SEEK_BACKWARD_SECONDS}
                    onPress={handleSeekBackwardPress}
                  />
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
                {isPodcast && (
                  <PodcastSeekButton
                    testID="player-seek-forward-button"
                    direction="forward"
                    seconds={PODCAST_SEEK_FORWARD_SECONDS}
                    onPress={handleSeekForwardPress}
                  />
                )}
                {!isRadio && (
                  <FadeOut
                    testID="player-next-button"
                    onPress={handleNextPress}
                  >
                    <SkipForward
                      size={isPodcast ? 28 : 36}
                      color="white"
                      fill="white"
                    />
                  </FadeOut>
                )}
                {!isRadio && !isPodcast && (
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
                {/* Rendered on lyrics-capable tracks even when this one has
                    none, so the row doesn't reshuffle between tracks. */}
                {!isRadio && !isPodcast && lyricsSource !== "off" && (
                  <FadeOut
                    testID="player-inline-lyrics-button"
                    hitSlop={ICON_HIT_SLOP}
                    onPress={() => setPlayerInlineLyrics(!inlineLyricsEnabled)}
                    // Turning it back off stays possible on a track that has no
                    // lyrics to show, so the preference can never get stuck on.
                    disabled={!canShowInlineLyrics && !inlineLyricsEnabled}
                    accessibilityLabel={t("app.player.inlineLyrics")}
                  >
                    <Captions
                      size={24}
                      color={inlineLyricsEnabled ? emerald500 : "white"}
                    />
                    {inlineLyricsEnabled && (
                      <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                        <Box className="bg-emerald-500 rounded-full size-1" />
                      </Box>
                    )}
                  </FadeOut>
                )}
                <FadeOut
                  testID="player-output-button"
                  hitSlop={ICON_HIT_SLOP}
                  onPress={handleOutputPress}
                  disabled={!isOnline}
                >
                  <Cast
                    size={24}
                    color={playingRemotely ? emerald500 : "white"}
                  />
                  {playingRemotely && (
                    <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                      <Box className="bg-emerald-500 rounded-full size-1" />
                    </Box>
                  )}
                </FadeOut>
                {isPodcast && (
                  <FadeOut
                    testID="player-speed-button"
                    hitSlop={ICON_HIT_SLOP}
                    onPress={handleSpeedPress}
                    accessibilityLabel={t("app.player.playbackSpeed")}
                  >
                    <Text className="text-white font-bold text-base">
                      {t("app.player.playbackSpeedValue", {
                        rate: podcastPlaybackRate,
                      })}
                    </Text>
                  </FadeOut>
                )}
                {/* Same slot as the podcast speed button — the two never show
                    together. */}
                {!isRadio && !isPodcast && lyricsSource === "all" && (
                  <FadeOut
                    testID="player-lyrics-picker-button"
                    hitSlop={ICON_HIT_SLOP}
                    onPress={handleLyricsPickerPress}
                    disabled={!isOnline}
                    accessibilityLabel={t("app.player.lyricsPicker")}
                  >
                    <Mic2 size={24} color="white" />
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
        speedSheetRef={speedSheetRef}
        lyricsPickerSheetRef={lyricsPickerSheetRef}
        playingTrack={playingTrack ?? null}
        hasKaraoke={hasKaraoke}
        onAddFavoritePodcast={handleAddFavoritePodcastPress}
        onRemoveFavoritePodcast={handleRemoveFavoritePodcastPress}
      />
    </LinearGradient>
  );
}
