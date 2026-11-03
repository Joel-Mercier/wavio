import { useEffect, useRef, useState } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import FadeOut from "@/components/FadeOut";
import KaraokeFillLine from "@/components/player/KaraokeFillLine";
import KaraokeLine from "@/components/player/KaraokeLine";
import { Box } from "@/components/ui/box";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import { useLyricsClock } from "@/hooks/player/useLyricsClock";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { findCurrentLineIndex, getCueLineForLine } from "@/utils/lyrics";

const HIT_SLOP = { top: 12, bottom: 12, left: 16, right: 16 };

export default function CurrentLyricLine({
  lyrics,
  onPress,
  visible = true,
}: {
  lyrics: StructuredLyrics | null;
  onPress?: () => void;
  // Stays mounted under screens pushed over the player; the word-fill frame
  // loop must not run behind them.
  visible?: boolean;
}) {
  // Subscribe to the raw progress channel and only re-render when the active
  // line *index* changes — not on every ~4 Hz tick. findCurrentLineIndex still
  // runs per tick (cheap, JS thread), but the setState bails out via referential
  // equality unless the line actually advances.
  const [currentIndex, setCurrentIndex] = useState(-1);
  const karaokeEnabled = useApp((s) => s.karaokeEnabled);
  const karaokeWordFill = useApp((s) => s.karaokeWordFill);

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

  const cueLine = karaokeEnabled
    ? getCueLineForLine(lyrics, currentIndex)
    : undefined;
  const fillEnabled = karaokeWordFill && !!cueLine?.cue?.length;
  const fillPosition = useLyricsClock(
    lyrics?.offset ?? 0,
    fillEnabled && visible,
  );

  // Always reserve the slot's height so the surrounding layout doesn't shift
  // when there's no active line yet, during instrumental pauses (empty line
  // value), or for tracks without lyrics at all. Only the text fades in/out.
  const value =
    lyrics && currentIndex >= 0
      ? lyrics.line[currentIndex]?.value?.trim()
      : undefined;

  if (!value) {
    return <Box className="px-6 h-12 items-center justify-center" />;
  }

  const line =
    cueLine?.cue?.length && fillEnabled ? (
      // A wrapping row can't ellipsize, so the slot clips past its two lines.
      <Animated.View style={animatedStyle} className="max-h-12 overflow-hidden">
        <KaraokeFillLine
          cueLine={cueLine}
          position={fillPosition}
          align="center"
          textClassName="text-white text-center font-bold text-base"
        />
      </Animated.View>
    ) : cueLine?.cue?.length ? (
      <Animated.View style={animatedStyle}>
        <KaraokeLine
          cueLine={cueLine}
          offsetMs={lyrics?.offset ?? 0}
          numberOfLines={2}
          textClassName="text-white text-center font-bold text-base"
        />
      </Animated.View>
    ) : (
      <Animated.Text
        numberOfLines={2}
        style={animatedStyle}
        className="text-white text-center font-bold text-base"
      >
        {value}
      </Animated.Text>
    );

  return (
    <Box className="px-6 h-12 items-center justify-center">
      {onPress ? (
        <FadeOut onPress={onPress} hitSlop={HIT_SLOP}>
          {line}
        </FadeOut>
      ) : (
        line
      )}
    </Box>
  );
}
