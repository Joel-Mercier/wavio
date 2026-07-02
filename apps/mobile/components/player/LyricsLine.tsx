import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Text } from "@/components/ui/text";

export const LYRICS_LINE_HEIGHT = 64;

export default function LyricsLine({
  value,
  isActive,
  isPast,
  onPress,
}: {
  value: string;
  isActive: boolean;
  isPast: boolean;
  onPress?: () => void;
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

  const trimmed = value?.trim();
  const content = (
    <Animated.View
      style={[
        { minHeight: LYRICS_LINE_HEIGHT, justifyContent: "center" },
        animatedStyle,
      ]}
    >
      <Text
        className={
          isActive
            ? "text-white font-bold text-2xl"
            : "text-primary-100 text-xl"
        }
      >
        {trimmed || " "}
      </Text>
    </Animated.View>
  );

  if (!onPress) return content;
  return <FadeOutScaleDown onPress={onPress}>{content}</FadeOutScaleDown>;
}
