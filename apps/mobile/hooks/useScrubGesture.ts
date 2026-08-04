import { useEffect, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { usePanGesture } from "react-native-gesture-handler";
import {
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const DEFAULT_SETTLE_EPSILON = 0.01;

export type ScrubGestureOptions = {
  // Current position as a 0..1 fraction. Pass `progress` (a shared value, for a
  // high-frequency source like playback time — no React re-render) or `value` (a
  // plain controlled number). `progress` takes precedence.
  value?: number;
  progress?: SharedValue<number>;
  disabled?: boolean;
  // After release, the dragged position is held until the source lands within
  // this fraction of it, so the position doesn't snap back while an async commit
  // (e.g. a seek) catches up. A synchronous source settles on the next frame.
  settleEpsilon?: number;
  // When this changes, any in-flight drag/hold is dropped (e.g. on track change).
  resetKey?: string | number;
  // Fired continuously while dragging (and on the initial touch).
  onScrub?: (frac: number) => void;
  // Fired on release — for both a tap and the end of a drag.
  onComplete?: (frac: number) => void;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
};

export type ScrubGesture = {
  gesture: ReturnType<typeof usePanGesture>;
  onLayout: (e: LayoutChangeEvent) => void;
  // Drag position while dragging, else the held release position, else the
  // source. Raw 0..1 over the full measured width — consumers apply their own
  // inset (e.g. a thumb radius) when mapping it to pixels.
  displayFrac: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  widthSV: SharedValue<number>;
  // React-side mirror of the measured width, for geometry computed in render.
  width: number;
};

// The scrub interaction shared by the plain seek slider and the waveform
// seekbar: drag/tap position tracking, the post-release hold, and the reset on
// source change. Rendering (track, fill, thumb, bars) stays in the component.
export default function useScrubGesture({
  value,
  progress,
  disabled = false,
  settleEpsilon = DEFAULT_SETTLE_EPSILON,
  resetKey,
  onScrub,
  onComplete,
  hitSlop = { top: 16, bottom: 16 },
}: ScrubGestureOptions): ScrubGesture {
  const [width, setWidth] = useState(0);
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

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    widthSV.value = w;
  };

  // A single pan with minDistance 0 handles both a tap (begin -> finalize with no
  // movement) and a drag, so tapping anywhere on the bar reliably seeks. The
  // commit lives in onFinalize, which always fires on release; the seek/commit
  // fires only on release, while dragging just moves the position.
  const gesture = usePanGesture({
    minDistance: 0,
    enabled: !disabled,
    hitSlop,
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

  return { gesture, onLayout, displayFrac, isDragging, widthSV, width };
}
