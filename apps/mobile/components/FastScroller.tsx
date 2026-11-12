import type { LegendListRef } from "@legendapp/list/react-native";
import { useCallback, useMemo } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  type SharedValue,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import { selectionHaptic } from "@/services/haptics";

const MIN_ITEMS = 50;
const MIN_SCREENS = 3;
const THUMB_HIT_WIDTH = 20;
const THUMB_HIT_HEIGHT = 56;
const THUMB_WIDTH = 6;
const THUMB_HEIGHT = 44;
const HIDE_DELAY = 1200;

export const STICKY_HEADER_CLEARANCE = 72;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function reveal(opacity: SharedValue<number>) {
  "worklet";
  opacity.value = withTiming(1, { duration: 150 });
}

function hideLater(opacity: SharedValue<number>) {
  "worklet";
  opacity.value = withDelay(HIDE_DELAY, withTiming(0, { duration: 300 }));
}

function hideNow(opacity: SharedValue<number>) {
  "worklet";
  opacity.value = withTiming(0, { duration: 150 });
}

export type FastScroll = ReturnType<typeof useFastScroll>;

export function useFastScroll() {
  // biome-ignore lint/suspicious/noExplicitAny: LegendListRef fails Reanimated's InstanceOrElement constraint, but resolves through getNativeScrollRef at runtime
  const listRef = useAnimatedRef<any>();
  const offset = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const opacity = useSharedValue(0);
  const shown = useSharedValue(false);
  const listDragging = useSharedValue(false);
  const momentum = useSharedValue(false);
  const thumbActive = useSharedValue(false);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.y;
      contentHeight.value = event.contentSize.height;
      viewportHeight.value = event.layoutMeasurement.height;
      // Only a scroll the user drives reveals the thumb: the list also moves
      // itself (restored offsets, size adjustments), and that shouldn't flash it.
      if (!shown.value && (listDragging.value || momentum.value)) {
        shown.value = true;
        reveal(opacity);
      }
    },
    onBeginDrag: () => {
      listDragging.value = true;
      momentum.value = false;
    },
    onEndDrag: () => {
      listDragging.value = false;
      if (!momentum.value && !thumbActive.value) {
        shown.value = false;
        hideLater(opacity);
      }
    },
    onMomentumBegin: () => {
      momentum.value = true;
    },
    onMomentumEnd: () => {
      momentum.value = false;
      if (!listDragging.value && !thumbActive.value) {
        shown.value = false;
        hideLater(opacity);
      }
    },
  });

  // A list that remounts mid-gesture never reports the drag or fling ending,
  // and a new mount is the one layout every list instance is sure to report.
  const handleListLayout = (event: LayoutChangeEvent) => {
    viewportHeight.value = event.nativeEvent.layout.height;
    listDragging.value = false;
    momentum.value = false;
    if (!thumbActive.value) {
      shown.value = false;
      hideNow(opacity);
    }
  };

  const handleContentSizeChange = (_width: number, height: number) => {
    contentHeight.value = height;
  };

  const getList = useCallback(
    () => listRef.current as LegendListRef | null,
    [listRef],
  );

  return {
    listProps: {
      ref: listRef,
      onScroll: scrollHandler,
      onLayout: handleListLayout,
      onContentSizeChange: handleContentSizeChange,
    },
    getList,
    listRef,
    offset,
    contentHeight,
    viewportHeight,
    opacity,
    shown,
    thumbActive,
  };
}

type FastScrollerProps = {
  fastScroll: FastScroll;
  itemCount: number;
  top?: number;
  bottom?: number;
};

export default function FastScroller({
  fastScroll,
  itemCount,
  top = 0,
  bottom = 0,
}: FastScrollerProps) {
  const [idleColor, activeColor] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-emerald-500",
  ]) as string[];
  const {
    listRef,
    offset,
    contentHeight,
    viewportHeight,
    opacity,
    shown,
    thumbActive,
  } = fastScroll;
  const trackHeight = useSharedValue(0);
  const dragTop = useSharedValue(0);
  const startTop = useSharedValue(0);
  // Frozen for the length of a drag: on a paged list, holding the thumb at the
  // bottom loads the next page, and following the new length would load the
  // page after that, and so on to the end.
  const dragMaxOffset = useSharedValue(0);
  const pressed = useSharedValue(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    trackHeight.value = event.nativeEvent.layout.height;
  };

  const pan = usePanGesture(
    useMemo(
      () => ({
        minDistance: 0,
        onBegin: () => {
          "worklet";
          const range = trackHeight.value - THUMB_HIT_HEIGHT;
          const maxOffset = contentHeight.value - viewportHeight.value;
          dragMaxOffset.value = maxOffset;
          startTop.value =
            range > 0 && maxOffset > 0
              ? clamp(offset.value / maxOffset, 0, 1) * range
              : 0;
          dragTop.value = startTop.value;
          thumbActive.value = true;
          shown.value = true;
          reveal(opacity);
          pressed.value = withTiming(1, { duration: 120 });
          scheduleOnRN(selectionHaptic);
        },
        onUpdate: (event: { translationY: number }) => {
          "worklet";
          const range = trackHeight.value - THUMB_HIT_HEIGHT;
          const maxOffset = dragMaxOffset.value;
          if (range <= 0 || maxOffset <= 0) return;
          const next = clamp(startTop.value + event.translationY, 0, range);
          if (next === dragTop.value) return;
          dragTop.value = next;
          scrollTo(listRef, 0, (next / range) * maxOffset, false);
        },
        onFinalize: () => {
          "worklet";
          thumbActive.value = false;
          shown.value = false;
          hideLater(opacity);
          pressed.value = withTiming(0, { duration: 150 });
        },
      }),
      [
        listRef,
        offset,
        contentHeight,
        viewportHeight,
        opacity,
        shown,
        thumbActive,
        trackHeight,
        dragTop,
        startTop,
        dragMaxOffset,
        pressed,
      ],
    ),
  );

  const thumbStyle = useAnimatedStyle(() => {
    const range = Math.max(0, trackHeight.value - THUMB_HIT_HEIGHT);
    const maxOffset = contentHeight.value - viewportHeight.value;
    const isLongEnough = maxOffset > viewportHeight.value * (MIN_SCREENS - 1);
    const visibility = isLongEnough ? opacity.value : 0;
    const translateY = thumbActive.value
      ? dragTop.value
      : maxOffset > 0
        ? clamp(offset.value / maxOffset, 0, 1) * range
        : 0;
    return {
      opacity: visibility,
      pointerEvents: visibility > 0.1 ? "auto" : "none",
      transform: [{ translateY }],
    };
  });

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      pressed.value,
      [0, 1],
      [idleColor, activeColor],
    ),
    transform: [
      { scaleX: 1 + pressed.value * 0.67 },
      { scaleY: 1 + pressed.value * 0.15 },
    ],
  }));

  if (itemCount < MIN_ITEMS) return null;

  return (
    <View
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={handleLayout}
      style={{
        position: "absolute",
        top,
        bottom,
        right: 0,
        width: THUMB_HIT_WIDTH,
      }}
    >
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              right: 0,
              width: THUMB_HIT_WIDTH,
              height: THUMB_HIT_HEIGHT,
              alignItems: "flex-end",
              justifyContent: "center",
              paddingRight: 6,
            },
            thumbStyle,
          ]}
        >
          <Animated.View
            style={[
              {
                width: THUMB_WIDTH,
                height: THUMB_HEIGHT,
                borderRadius: THUMB_WIDTH / 2,
              },
              pillStyle,
            ]}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
