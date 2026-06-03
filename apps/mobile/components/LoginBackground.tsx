import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

// Mirrors the drifting hero waves on the marketing site
// (apps/landing/src/components/Home.astro). Each wave is a sine-like path
// rendered into a 200%-wide SVG that slowly drifts left/right.
const STROKE_COLOR = "#10b981";

type WaveConfig = {
  d: string;
  topRatio: number;
  opacity: number;
  duration: number;
  // "alternate-reverse" on the site == start the drift from the far edge
  reverse: boolean;
};

const WAVES: WaveConfig[] = [
  {
    d: "M0 100 Q 150 20, 300 100 T 600 100 T 900 100 T 1200 100",
    topRatio: 0.22,
    opacity: 0.55,
    duration: 18000,
    reverse: false,
  },
  {
    d: "M0 100 Q 150 180, 300 100 T 600 100 T 900 100 T 1200 100",
    topRatio: 0.42,
    opacity: 0.35,
    duration: 24000,
    reverse: true,
  },
  {
    d: "M0 100 Q 150 40, 300 100 T 600 100 T 900 100 T 1200 100",
    topRatio: 0.62,
    opacity: 0.2,
    duration: 30000,
    reverse: false,
  },
];

// viewBox is 1200x200; the SVG is twice the screen width, so its height keeps
// the viewBox aspect ratio (matching the site's `h-auto w-[200%]`).
const VIEWBOX_RATIO = 200 / 1200;

function Wave({
  wave,
  screenWidth,
  screenHeight,
}: {
  wave: WaveConfig;
  screenWidth: number;
  screenHeight: number;
}) {
  const width = screenWidth * 2;
  const height = width * VIEWBOX_RATIO;
  const top = screenHeight * wave.topRatio - height / 2;
  const left = -screenWidth / 2;
  // drift == translateX between -3% and +3% of the element's own width
  const driftX = width * 0.03;

  const progress = useSharedValue(wave.reverse ? 1 : 0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(wave.reverse ? 0 : 1, {
        duration: wave.duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [progress, wave.reverse, wave.duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -driftX + progress.value * driftX * 2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top,
          left,
          width,
          height,
          opacity: wave.opacity,
        },
        animatedStyle,
      ]}
    >
      <Svg
        width={width}
        height={height}
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
      >
        <Path d={wave.d} stroke={STROKE_COLOR} strokeWidth={2} fill="none" />
      </Svg>
    </Animated.View>
  );
}

export default function LoginBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {WAVES.map((wave) => (
        <Wave
          key={wave.d}
          wave={wave}
          screenWidth={width}
          screenHeight={height}
        />
      ))}
    </Animated.View>
  );
}
