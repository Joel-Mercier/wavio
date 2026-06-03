import Repeat from "lucide-react-native/dist/esm/icons/repeat.mjs";
import Repeat1 from "lucide-react-native/dist/esm/icons/repeat-1.mjs";
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

export type RepeatMode = "off" | "all" | "one";

type RepeatToggleProps = {
  mode: RepeatMode;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
  hitSlop?: ComponentProps<typeof Pressable>["hitSlop"];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TIMING = { duration: 160, easing: Easing.out(Easing.quad) } as const;

export default function RepeatToggle({
  mode,
  onPress,
  size = 24,
  disabled = false,
  hitSlop,
}: RepeatToggleProps) {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];

  // color: 0 = off (white), 1 = active (emerald). one: 0 = Repeat, 1 = Repeat1.
  const color = useSharedValue(mode === "off" ? 0 : 1);
  const one = useSharedValue(mode === "one" ? 1 : 0);
  const dot = useSharedValue(mode === "all" ? 1 : 0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    color.value = withTiming(mode === "off" ? 0 : 1, TIMING);
    one.value = withTiming(mode === "one" ? 1 : 0, TIMING);
    dot.value = withTiming(mode === "all" ? 1 : 0, TIMING);
  }, [mode, color, one, dot]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // Repeat (white) shows only when off; Repeat (emerald) when "all"; Repeat1 when "one".
  const repeatWhiteStyle = useAnimatedStyle(() => ({
    opacity: 1 - color.value,
  }));
  const repeatEmeraldStyle = useAnimatedStyle(() => ({
    opacity: color.value * (1 - one.value),
  }));
  const repeatOneStyle = useAnimatedStyle(() => ({ opacity: one.value }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
    transform: [{ scale: dot.value }],
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
        <Animated.View style={[styles.fill, repeatWhiteStyle]}>
          <Repeat size={size} color={white} />
        </Animated.View>
        <Animated.View style={[styles.fill, repeatEmeraldStyle]}>
          <Repeat size={size} color={emerald500} />
        </Animated.View>
        <Animated.View style={[styles.fill, repeatOneStyle]}>
          <Repeat1 size={size} color={emerald500} />
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
