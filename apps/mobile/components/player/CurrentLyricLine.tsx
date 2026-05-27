import { useEffect, useMemo, useRef } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Box } from "@/components/ui/box";
import { usePlaybackProgress } from "@/hooks/player";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { findCurrentLineIndex } from "@/utils/lyrics";

export default function CurrentLyricLine({
  lyrics,
}: {
  lyrics: StructuredLyrics | null;
}) {
  const { currentTime } = usePlaybackProgress();
  const offsetMs = lyrics?.offset ?? 0;
  const positionMs = (currentTime ?? 0) * 1000 + offsetMs;
  const currentIndex = useMemo(
    () => (lyrics ? findCurrentLineIndex(lyrics.line, positionMs) : -1),
    [lyrics, positionMs],
  );
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

  if (!lyrics || currentIndex < 0) return null;
  const value = lyrics.line[currentIndex]?.value?.trim();
  if (!value) return null;

  return (
    <Box className="px-6 h-12 items-center justify-center">
      <Animated.Text
        numberOfLines={2}
        style={animatedStyle}
        className="text-white text-center font-bold text-base"
      >
        {value}
      </Animated.Text>
    </Box>
  );
}
