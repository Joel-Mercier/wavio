import { useEffect, useRef, useState } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Box } from "@/components/ui/box";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { findCurrentLineIndex } from "@/utils/lyrics";

export default function CurrentLyricLine({
  lyrics,
}: {
  lyrics: StructuredLyrics | null;
}) {
  // Subscribe to the raw progress channel and only re-render when the active
  // line *index* changes — not on every ~4 Hz tick. findCurrentLineIndex still
  // runs per tick (cheap, JS thread), but the setState bails out via referential
  // equality unless the line actually advances.
  const [currentIndex, setCurrentIndex] = useState(-1);

  useEffect(() => {
    const update = () => {
      const { currentTime } = getPlaybackSnapshot();
      const positionMs = (currentTime ?? 0) * 1000 + (lyrics?.offset ?? 0);
      const next = lyrics ? findCurrentLineIndex(lyrics.line, positionMs) : -1;
      setCurrentIndex((prev) => (prev === next ? prev : next));
    };
    update();
    return subscribePlaybackProgress(update);
  }, [lyrics]);

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const lastIndexRef = useRef<number>(-2);

  useEffect(() => {
    if (currentIndex === lastIndexRef.current) return;
    lastIndexRef.current = currentIndex;
    opacity.value = 0;
    translateY.value = 8;
    opacity.value = withTiming(1, { duration: 250 });
    translateY.value = withTiming(0, { duration: 250 });
  }, [currentIndex, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Always reserve the slot's height so the surrounding layout doesn't shift
  // when there's no active line yet, during instrumental pauses (empty line
  // value), or for tracks without lyrics at all. Only the text fades in/out.
  const value =
    lyrics && currentIndex >= 0
      ? lyrics.line[currentIndex]?.value?.trim()
      : undefined;

  return (
    <Box className="px-6 h-12 items-center justify-center">
      {value ? (
        <Animated.Text
          numberOfLines={2}
          style={animatedStyle}
          className="text-white text-center font-bold text-base"
        >
          {value}
        </Animated.Text>
      ) : null}
    </Box>
  );
}
