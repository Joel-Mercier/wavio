import { usePathname, useRouter } from "expo-router";
import AudioLines from "lucide-react-native/icons/audio-lines";
import SkipForward from "lucide-react-native/icons/skip-forward";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import ImageWithFallback from "@/components/ImageWithFallback";
import MovingText from "@/components/MovingText";
import { OFFLINE_BANNER_HEIGHT } from "@/components/OfflineBanner";
import PlayPauseButton from "@/components/PlayPauseButton";
import FloatingPlayerActionButton from "@/components/player/FloatingPlayerActionButton";
import FloatingPlayerRestoreBadge from "@/components/player/FloatingPlayerRestoreBadge";
import PlaybackProgressBar from "@/components/player/PlaybackProgressBar";
import SleepTimerBadge from "@/components/player/SleepTimerBadge";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import useImageColors from "@/hooks/useImageColors";
import { useIsOnline } from "@/hooks/useIsOnline";
import { useTrackArtwork } from "@/hooks/useTrackArtwork";
import { skipNext, skipPrevious, togglePlayPause } from "@/services/player";
import useApp, { type FloatingPlayerAction, SIDEBAR_WIDTH } from "@/stores/app";
import useFloatingPlayer from "@/stores/floatingPlayer";
import useQueue from "@/stores/queue";
import { hidesFloatingPlayer } from "@/utils/floatingPlayerRoutes";
import { isSpokenWordTrack } from "@/utils/trackSource";

export const FLOATING_PLAYER_HEIGHT = 64;
// Approximate default react-navigation bottom tab content height (excluding the
// safe-area inset). The portrait player sits directly on top of the tab bar, so
// its bottom must track the real tab bar height instead of a hardcoded value.
export const TAB_BAR_CONTENT_HEIGHT = 49;

const SWIPE_THRESHOLD = 80;
const MAX_TRANSLATE = 140;

const DISMISS_THRESHOLD = 60;
const DISMISS_ACTIVATE = 15;
const HIDE_TRANSLATE = FLOATING_PLAYER_HEIGHT + 24;

// The sidebar player always has its own skip-next button beside play/pause.
function withoutFixedSkip(action: FloatingPlayerAction | null) {
  return action === "skipNext" ? null : action;
}

export default function FloatingPlayer() {
  const { t } = useTranslation();
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const router = useRouter();
  const pathname = usePathname();
  const artwork = useTrackArtwork(playingTrack);
  const colors = useImageColors(artwork);
  const [black, white] = Uniwind.getCSSVariable([
    "--color-black",
    "--color-white",
  ]) as string[];
  const floatingPlayerAction1 = useApp((s) => s.floatingPlayerAction1);
  const floatingPlayerAction2 = useApp((s) => s.floatingPlayerAction2);
  const queueLength = useQueue((s) => s.queue.length);
  const currentIndex = useQueue((s) => s.currentIndex);
  const repeatMode = useQueue((s) => s.repeatMode);

  const isRadio = !!playingTrack?.isRadio;
  const isSpokenWord = isSpokenWordTrack(playingTrack);
  const canSkipNext =
    !isRadio &&
    (repeatMode !== "off" ||
      (currentIndex != null && currentIndex < queueLength - 1));
  const canSkipPrevious =
    !isRadio &&
    (repeatMode !== "off" || (currentIndex != null && currentIndex > 0));

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const hidden = useFloatingPlayer((s) => s.hidden);
  const setHidden = useFloatingPlayer((s) => s.setHidden);
  const prevIdRef = useRef(playingTrack?.id);

  useEffect(() => {
    const id = playingTrack?.id;
    if (id && id !== prevIdRef.current) {
      prevIdRef.current = id;
      setHidden(false);
      translateY.value = withTiming(0, { duration: 220 });
    }
  }, [playingTrack?.id, translateY, setHidden]);

  useEffect(() => () => setHidden(false), [setHidden]);

  const handlePress = () => {
    router.navigate("/player");
  };

  const handleRestorePress = () => {
    setHidden(false);
    translateY.value = withTiming(0, { duration: 220 });
  };

  const handlePlayPausePress = () => {
    togglePlayPause();
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

  const dismissGesture = usePanGesture({
    activeOffsetY: DISMISS_ACTIVATE,
    failOffsetX: [-15, 15],
    onUpdate: (e) => {
      let ty = e.translationY;
      if (ty < 0) ty = 0;
      if (ty > HIDE_TRANSLATE) ty = HIDE_TRANSLATE;
      translateY.value = ty;
    },
    onDeactivate: (e) => {
      if (e.translationY >= DISMISS_THRESHOLD) {
        translateY.value = withTiming(
          HIDE_TRANSLATE,
          { duration: 180 },
          (finished) => {
            if (finished) scheduleOnRN(setHidden, true);
          },
        );
      } else {
        translateY.value = withTiming(0, { duration: 180 });
      }
    },
  });

  const composedGesture = useCompetingGestures(panGesture, dismissGesture);

  const dismissStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(
      translateY.value,
      [0, HIDE_TRANSLATE],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!playingTrack || hidesFloatingPlayer(pathname)) {
    return null;
  }

  const backgroundColor =
    (colors?.platform === "ios"
      ? colors.background
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;

  if (isWideLayout) {
    return (
      <Box
        pointerEvents="box-none"
        className="absolute left-0 bottom-0"
        style={{
          width: SIDEBAR_WIDTH,
          // Match the sidebar's own start padding so the player clears a
          // landscape left cutout (what is the top inset in portrait).
          paddingLeft: insets.left,
          bottom: insets.bottom + 12 + (isOnline ? 0 : OFFLINE_BANNER_HEIGHT),
        }}
      >
        <SleepTimerBadge />
        <Pressable testID="floating-player" onPress={handlePress}>
          <VStack className="relative mx-2 px-2 pt-3 pb-2 gap-y-3">
            <PlaybackProgressBar position="top" />
            <HStack className="items-center gap-x-2">
              <ImageWithFallback
                source={artwork ? { uri: artwork } : undefined}
                recyclingKey={null}
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
                <MovingText animate={isPlaying}>
                  <Text className="text-white font-bold text-sm">
                    {playingTrack.title || ""}
                  </Text>
                </MovingText>
                <MovingText animate={isPlaying}>
                  <Text className="text-gray-300 text-xs">
                    {playingTrack.artist ||
                      (!isRadio && !isSpokenWord
                        ? t("app.shared.unknownArtist")
                        : "")}
                  </Text>
                </MovingText>
              </VStack>
              <FloatingPlayerActionButton
                action={withoutFixedSkip(floatingPlayerAction2)}
                track={playingTrack}
                size={24}
                hitSlop={8}
              />
            </HStack>
            <HStack className="items-center justify-between">
              <Box className="min-w-5 items-start">
                <FloatingPlayerActionButton
                  action={withoutFixedSkip(floatingPlayerAction1)}
                  track={playingTrack}
                  size={20}
                  hitSlop={8}
                />
              </Box>
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
      </Box>
    );
  }

  const bottom =
    insets.bottom +
    TAB_BAR_CONTENT_HEIGHT +
    (isOnline ? 0 : OFFLINE_BANNER_HEIGHT);

  if (hidden) {
    return (
      <Box
        pointerEvents="box-none"
        className="absolute right-0 left-0"
        style={{ bottom }}
      >
        <FloatingPlayerRestoreBadge onPress={handleRestorePress} />
      </Box>
    );
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute right-0 left-0"
      style={[dismissStyle, { bottom }]}
    >
      <SleepTimerBadge />
      <GestureDetector gesture={composedGesture}>
        <Animated.View>
          <Pressable testID="floating-player" onPress={handlePress}>
            <HStack
              className="h-16 mx-2 px-4 py-2 rounded-md items-center justify-between overflow-hidden"
              style={{
                backgroundColor: backgroundColor,
              }}
            >
              <HStack className="items-center flex-1">
                <Box style={{ zIndex: 2 }} className="rounded-md">
                  <ImageWithFallback
                    source={artwork ? { uri: artwork } : undefined}
                    recyclingKey={null}
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
                  <MovingText animate={isPlaying}>
                    <Text className="text-white font-bold text-md">
                      {playingTrack.title || ""}
                    </Text>
                  </MovingText>
                  <MovingText animate={isPlaying}>
                    <Text className="text-gray-300">
                      {playingTrack.artist ||
                        (!isRadio && !isSpokenWord
                          ? t("app.shared.unknownArtist")
                          : "")}
                    </Text>
                  </MovingText>
                </Animated.View>
              </HStack>
              <HStack className="items-center pl-4 gap-4" style={{ zIndex: 2 }}>
                <FloatingPlayerActionButton
                  action={floatingPlayerAction1}
                  track={playingTrack}
                  size={24}
                  hitSlop={12}
                />
                <FloatingPlayerActionButton
                  action={floatingPlayerAction2}
                  track={playingTrack}
                  size={24}
                  hitSlop={12}
                />
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
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
