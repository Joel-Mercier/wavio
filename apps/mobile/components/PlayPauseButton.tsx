import Pause from "lucide-react-native/dist/esm/icons/pause.mjs";
import Play from "lucide-react-native/dist/esm/icons/play.mjs";
import { type ComponentProps, useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { cn } from "@/utils/tailwind";

type PlayPauseButtonProps = {
  isPlaying: boolean;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  className?: string;
  hitSlop?: ComponentProps<typeof Pressable>["hitSlop"];
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PlayPauseButton({
  isPlaying,
  onPress,
  size = 64,
  iconSize = 24,
  color: colorProp,
  className,
  hitSlop,
}: PlayPauseButtonProps) {
  const [gray800] = Uniwind.getCSSVariable(["--color-gray-800"]) as string[];
  const color = colorProp ?? gray800;

  // progress: 0 = paused (Play shown), 1 = playing (Pause shown).
  const progress = useSharedValue(isPlaying ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(isPlaying ? 1 : 0, {
      duration: 140,
      easing: Easing.out(Easing.quad),
    });
  }, [isPlaying, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const playStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [1, 0.5]) },
      { rotate: `${interpolate(progress.value, [0, 1], [0, -90])}deg` },
    ],
  }));

  const pauseStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.5, 1]) },
      { rotate: `${interpolate(progress.value, [0, 1], [90, 0])}deg` },
    ],
  }));

  const handlePressIn = () => {
    pressScale.value = withTiming(0.92, { duration: 100 });
  };

  const handlePressOut = () => {
    pressScale.value = withSpring(1, {
      mass: 0.6,
      damping: 12,
      stiffness: 220,
    });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={hitSlop}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={containerStyle}
    >
      <Box
        className={cn("rounded-full items-center justify-center", className)}
        style={{ width: size, height: size }}
      >
        <Animated.View
          style={[styles.iconLayer, playStyle]}
          pointerEvents="none"
        >
          <Play size={iconSize} color={color} fill={color} />
        </Animated.View>
        <Animated.View
          style={[styles.iconLayer, pauseStyle]}
          pointerEvents="none"
        >
          <Pause size={iconSize} color={color} fill={color} />
        </Animated.View>
      </Box>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  iconLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
