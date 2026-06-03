import Shuffle from "lucide-react-native/dist/esm/icons/shuffle.mjs";
import { type ComponentProps, useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";

type ShuffleToggleProps = {
  active: boolean;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
  hitSlop?: ComponentProps<typeof Pressable>["hitSlop"];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ShuffleToggle({
  active,
  onPress,
  size = 24,
  disabled = false,
  hitSlop,
}: ShuffleToggleProps) {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];

  // progress: 0 = inactive (white), 1 = active (emerald + dot).
  const progress = useSharedValue(active ? 1 : 0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.quad),
    });
  }, [active, progress]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const whiteStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const emeraldStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));

  const handlePress = () => {
    if (disabled) return;
    onPress();
  };

  const handlePressIn = () => {
    opacity.value = withTiming(0.5, { duration: 100 });
  };

  const handlePressOut = () => {
    opacity.value = withTiming(1, { duration: 100 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={hitSlop}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={containerStyle}
    >
      <Box style={{ width: size, height: size }}>
        <Animated.View style={[styles.fill, whiteStyle]}>
          <Shuffle size={size} color={white} />
        </Animated.View>
        <Animated.View style={[styles.fill, emeraldStyle]}>
          <Shuffle size={size} color={emerald500} />
        </Animated.View>
      </Box>
      <Animated.View style={[styles.dotWrap, dotStyle]} pointerEvents="none">
        <Box className="bg-emerald-500 rounded-full size-1" />
      </Animated.View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  dotWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -8,
    alignItems: "center",
    justifyContent: "center",
  },
});
