import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";

const SWEEP_DURATION = 1400;
// Pause between sweeps so the pulse reads as a periodic accent, not a constant
// scroll.
const PULSE_DELAY = 600;

// A translucent emerald band that slowly sweeps left→right across its parent,
// signalling that the current track is buffering. Fills the parent (which must
// clip it, or pass a matching `borderRadius`) and is purely decorative.
export default function BufferingSweep({
  borderRadius = 0,
  style,
}: {
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [emerald] = Uniwind.getCSSVariable(["--color-emerald-500"]) as string[];
  const [width, setWidth] = useState(0);
  const translateX = useSharedValue(0);
  const bandWidth = Math.max(48, width * 0.6);

  useEffect(() => {
    if (width === 0) return;
    translateX.value = -bandWidth;
    translateX.value = withRepeat(
      withSequence(
        // Reset off the left edge, sweep across, then park off the right edge
        // (band invisible) for the delay before the next pulse.
        withTiming(-bandWidth, { duration: 0 }),
        withTiming(width, {
          duration: SWEEP_DURATION,
          easing: Easing.inOut(Easing.ease),
        }),
        withDelay(PULSE_DELAY, withTiming(width, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(translateX);
    };
  }, [translateX, width, bandWidth]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius,
          overflow: "hidden",
        },
        style,
      ]}
      onLayout={(e) => setWidth(Math.ceil(e.nativeEvent.layout.width))}
    >
      {width > 0 && (
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, width: bandWidth },
            bandStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", emerald, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}
