import { useEffect, useState } from "react";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import BufferingSweep from "@/components/player/BufferingSweep";

const CONTAINER_HEIGHT = 24;
const TRACK_HEIGHT = 6;
const THUMB_SIZE = 16;
const TRACK_TOP = (CONTAINER_HEIGHT - TRACK_HEIGHT) / 2;
const THUMB_TOP = (CONTAINER_HEIGHT - THUMB_SIZE) / 2;
const TICK_HEIGHT = 22;
const DEFAULT_SETTLE_EPSILON = 0.01;

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
  settleEpsilon = DEFAULT_SETTLE_EPSILON,
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

  const [trackWidth, setTrackWidth] = useState(0);
  const widthSV = useSharedValue(0);
  // The source of truth: either an externally driven shared value (`progress`)
  // or a shared value we mirror the controlled `value` into.
  const controlled = useSharedValue(value ?? 0);
  const source = progress ?? controlled;

  const isDragging = useSharedValue(false);
  const dragFrac = useSharedValue(0);
  const pending = useSharedValue(-1);

  useEffect(() => {
    if (progress == null && value != null) controlled.value = value;
  }, [value, progress, controlled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: shared-value writes are stable; intentionally re-run only when the identity changes.
  useEffect(() => {
    isDragging.value = false;
    pending.value = -1;
  }, [resetKey]);

  const displayFrac = useDerivedValue(() => {
    if (isDragging.value) return dragFrac.value;
    if (pending.value >= 0) return pending.value;
    return source.value;
  });

  useAnimatedReaction(
    () => source.value,
    (cur) => {
      if (
        pending.value >= 0 &&
        Math.abs(cur - pending.value) <= settleEpsilon
      ) {
        pending.value = -1;
      }
    },
    [settleEpsilon],
  );

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

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    widthSV.value = w;
  };

  // A single pan with minDistance 0 handles both a tap (begin -> finalize with no
  // movement) and a drag, so tapping anywhere on the bar reliably seeks. The
  // commit lives in onFinalize, which always fires on release; the seek/commit
  // fires only on release, while dragging just moves the thumb.
  const gesture = usePanGesture({
    minDistance: 0,
    enabled: !disabled,
    hitSlop: { top: 16, bottom: 16 },
    onBegin: (e) => {
      const w = widthSV.value;
      const frac = w > 0 ? Math.min(1, Math.max(0, e.x / w)) : 0;
      isDragging.value = true;
      dragFrac.value = frac;
      if (onScrub) scheduleOnRN(onScrub, frac);
    },
    onUpdate: (e) => {
      const w = widthSV.value;
      const frac = w > 0 ? Math.min(1, Math.max(0, e.x / w)) : 0;
      dragFrac.value = frac;
      if (onScrub) scheduleOnRN(onScrub, frac);
    },
    onFinalize: () => {
      const frac = dragFrac.value;
      isDragging.value = false;
      // Hold the released position until the source catches up, unless it's
      // already there (a synchronous source needs no hold).
      if (Math.abs(source.value - frac) > settleEpsilon) pending.value = frac;
      if (onComplete) scheduleOnRN(onComplete, frac);
    },
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[{ height: CONTAINER_HEIGHT, justifyContent: "center" }, style]}
        onLayout={handleLayout}
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
