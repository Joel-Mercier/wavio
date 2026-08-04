import type { ViewStyle } from "react-native";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Uniwind } from "uniwind";
import BufferingSweep from "@/components/player/BufferingSweep";
import useScrubGesture from "@/hooks/useScrubGesture";

const CONTAINER_HEIGHT = 24;
const TRACK_HEIGHT = 6;
const THUMB_SIZE = 16;
const TRACK_TOP = (CONTAINER_HEIGHT - TRACK_HEIGHT) / 2;
const THUMB_TOP = (CONTAINER_HEIGHT - THUMB_SIZE) / 2;
const TICK_HEIGHT = 22;

type GestureSliderProps = {
  // Current position as a 0..1 fraction. Pass `progress` (a shared value, for a
  // high-frequency source like playback time — no React re-render) or `value` (a
  // plain controlled number). `progress` takes precedence.
  value?: number;
  progress?: SharedValue<number>;
  disabled?: boolean;
  // When true, an emerald pulse sweeps across the track to signal buffering.
  buffering?: boolean;
  // Tick mark positions as 0..1 fractions (e.g. bookmarks).
  ticks?: number[];
  // After release, the dragged position is held until the source lands within
  // this fraction of it, so the thumb doesn't snap back while an async commit
  // (e.g. a seek) catches up. A synchronous source settles on the next frame.
  settleEpsilon?: number;
  // When this changes, any in-flight drag/hold is dropped (e.g. on track change).
  resetKey?: string | number;
  // Fired continuously while dragging (and on the initial touch).
  onScrub?: (frac: number) => void;
  // Fired on release — for both a tap and the end of a drag.
  onComplete?: (frac: number) => void;
  trackColor?: string;
  fillColor?: string;
  thumbColor?: string;
  tickColor?: string;
  style?: ViewStyle;
};

export default function GestureSlider({
  value,
  progress,
  disabled = false,
  buffering = false,
  ticks,
  settleEpsilon,
  resetKey,
  onScrub,
  onComplete,
  trackColor,
  fillColor,
  thumbColor,
  tickColor,
  style,
}: GestureSliderProps) {
  const [primary400, white, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-400",
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const track = trackColor ?? primary400;
  const fill = fillColor ?? white;
  const thumb = thumbColor ?? white;
  const tick = tickColor ?? emerald500;

  const {
    gesture,
    onLayout,
    displayFrac,
    widthSV,
    width: trackWidth,
  } = useScrubGesture({
    value,
    progress,
    disabled,
    settleEpsilon,
    resetKey,
    onScrub,
    onComplete,
  });

  const fillStyle = useAnimatedStyle(() => {
    const usable = Math.max(0, widthSV.value - THUMB_SIZE);
    const p = Math.min(1, Math.max(0, displayFrac.value));
    return { width: p * usable + THUMB_SIZE / 2 };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const usable = Math.max(0, widthSV.value - THUMB_SIZE);
    const p = Math.min(1, Math.max(0, displayFrac.value));
    return { transform: [{ translateX: p * usable }] };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[{ height: CONTAINER_HEIGHT, justifyContent: "center" }, style]}
        onLayout={onLayout}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TRACK_TOP,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            backgroundColor: track,
          }}
        />
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              top: TRACK_TOP,
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: fill,
            },
            fillStyle,
          ]}
        />
        {buffering && (
          <BufferingSweep
            borderRadius={TRACK_HEIGHT / 2}
            style={{
              left: 0,
              right: 0,
              top: TRACK_TOP,
              bottom: undefined,
              height: TRACK_HEIGHT,
            }}
          />
        )}
        {/* Ticks render on top of the bars: the tick's middle is hidden by the
            bar while its ends poke out above and below it. */}
        {trackWidth > 0 &&
          ticks?.map((frac) => {
            const usable = Math.max(0, trackWidth - THUMB_SIZE);
            const left =
              Math.min(1, Math.max(0, frac)) * usable + THUMB_SIZE / 2;
            return (
              <View
                key={frac}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left,
                  top: "50%",
                  height: TICK_HEIGHT,
                  width: 2,
                  marginTop: -TICK_HEIGHT / 2,
                  backgroundColor: tick,
                }}
              />
            );
          })}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: THUMB_TOP,
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: thumb,
            },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
  );
}
