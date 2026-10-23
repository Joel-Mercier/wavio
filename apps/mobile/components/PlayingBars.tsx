import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";

const BARS = [
  { rest: 0.45, low: 0.3, high: 1, duration: 700 },
  { rest: 0.8, low: 0.45, high: 0.9, duration: 900 },
  { rest: 0.6, low: 0.25, high: 0.85, duration: 800 },
] as const;

const BAR_WIDTH = 3;
const BAR_GAP = 2;

function Bar({
  scale,
  height,
  color,
}: {
  scale: SharedValue<number>;
  height: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          height,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: color,
          transformOrigin: "bottom",
        },
        style,
      ]}
    />
  );
}

// Equalizer marking the collection that is playing. The bars only move while
// playback runs and the screen is focused, so a paused or covered screen
// leaves the UI thread idle.
export default function PlayingBars({
  playing,
  size = 14,
}: {
  playing: boolean;
  size?: number;
}) {
  const [emerald] = Uniwind.getCSSVariable(["--color-emerald-500"]) as string[];
  const isFocused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const animate = playing && isFocused && !reducedMotion;
  const bar0 = useSharedValue<number>(BARS[0].rest);
  const bar1 = useSharedValue<number>(BARS[1].rest);
  const bar2 = useSharedValue<number>(BARS[2].rest);

  useEffect(() => {
    const scales = [bar0, bar1, bar2];
    scales.forEach((scale, i) => {
      const { rest, low, high, duration } = BARS[i];
      cancelAnimation(scale);
      if (!animate) {
        scale.value = withTiming(rest, { duration: 200 });
        return;
      }
      const easing = Easing.inOut(Easing.ease);
      scale.value = withRepeat(
        withSequence(
          withTiming(high, { duration, easing }),
          withTiming(low, { duration, easing }),
        ),
        -1,
        true,
      );
    });
    return () => {
      for (const scale of scales) cancelAnimation(scale);
    };
  }, [animate, bar0, bar1, bar2]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: BAR_GAP,
        height: size,
      }}
    >
      {[bar0, bar1, bar2].map((scale, i) => (
        <Bar
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of bars
          key={i}
          scale={scale}
          height={size}
          color={emerald}
        />
      ))}
    </View>
  );
}
