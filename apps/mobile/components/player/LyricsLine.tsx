import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import KaraokeLine from "@/components/player/KaraokeLine";
import { Text } from "@/components/ui/text";
import type { CueLine } from "@/services/openSubsonic/types";
import type { LyricAlign } from "@/utils/lyrics";
import { cn } from "@/utils/tailwind";

export const LYRICS_LINE_HEIGHT = 64;

const ALIGN_ITEMS: Record<LyricAlign, "flex-start" | "flex-end" | "center"> = {
  left: "flex-start",
  right: "flex-end",
  center: "center",
};

const ALIGN_TEXT: Record<LyricAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export default function LyricsLine({
  value,
  isActive,
  isPast,
  onPress,
  cueLine,
  offsetMs = 0,
  align = "left",
  muted = false,
}: {
  value: string;
  isActive: boolean;
  isPast: boolean;
  onPress?: () => void;
  cueLine?: CueLine;
  offsetMs?: number;
  align?: LyricAlign;
  muted?: boolean;
}) {
  const opacity = useSharedValue(isActive ? 1 : isPast ? 0.6 : 0.8);
  const scale = useSharedValue(isActive ? 1 : 0.96);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : isPast ? 0.6 : 0.8, {
      duration: 250,
    });
    scale.value = withTiming(isActive ? 1 : 0.96, { duration: 250 });
  }, [isActive, isPast, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const activeClass = muted
    ? "text-primary-100 font-bold text-lg"
    : "text-white font-bold text-2xl";
  const inactiveClass = muted
    ? "text-primary-200 text-base"
    : "text-primary-100 text-xl";
  const textClass = cn(
    isActive ? activeClass : inactiveClass,
    ALIGN_TEXT[align],
  );

  const trimmed = value?.trim();
  const content = (
    <Animated.View
      style={[
        {
          minHeight: LYRICS_LINE_HEIGHT,
          justifyContent: "center",
          alignItems: ALIGN_ITEMS[align],
        },
        animatedStyle,
      ]}
    >
      {isActive && cueLine?.cue?.length ? (
        <KaraokeLine
          cueLine={cueLine}
          offsetMs={offsetMs}
          textClassName={textClass}
        />
      ) : (
        <Text className={textClass}>{trimmed || " "}</Text>
      )}
    </Animated.View>
  );

  if (!onPress) return content;
  return <FadeOutScaleDown onPress={onPress}>{content}</FadeOutScaleDown>;
}
