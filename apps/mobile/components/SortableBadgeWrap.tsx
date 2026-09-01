import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LayoutChangeEvent,
  LayoutRectangle,
  StyleProp,
  ViewStyle,
} from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  type GestureTouchEvent,
  ScrollView,
  useLongPressGesture,
  usePanGesture,
  useSimultaneousGestures,
} from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import useStableCallback from "@/hooks/useStableCallback";
import { selectionHaptic } from "@/services/haptics";

const DRAG_ACTIVATION_DURATION = 220;
const DRAG_ACTIVATION_MAX_DISTANCE = 24;
const DEFAULT_GAP = 8;
const ACTIVE_BADGE_OPACITY = 0.25;
const CARET_WIDTH = 2;
// Capped against the viewport as well: this scroller is a section of a sheet,
// not a full screen, so a fixed band would leave no neutral zone in the middle.
const AUTO_SCROLL_THRESHOLD = 64;
const AUTO_SCROLL_MIN_STEP = 2;
const AUTO_SCROLL_MAX_STEP = 10;

type Frame = LayoutRectangle;

// Which badge sits under the touch. Rows are found by their vertical band
// rather than by index arithmetic: badges wrap, so neither their width nor how
// many fit on a row is known ahead of layout.
function badgeAt(frames: Frame[], x: number, y: number): number {
  "worklet";
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    // Sibling `onLayout` order isn't guaranteed, so a frames array published
    // mid-measure can still have holes.
    if (frame === undefined) continue;
    if (
      y >= frame.y &&
      y <= frame.y + frame.height &&
      x >= frame.x &&
      x <= frame.x + frame.width
    ) {
      return i;
    }
  }
  return -1;
}

// The slot the dragged badge would land in, in reading order: 0 before the
// first badge, `frames.length` after the last one. Scanning in order means a
// touch in the gap between two rows resolves to the start of the row below,
// and a touch past the last row appends.
function slotAt(frames: Frame[], x: number, y: number): number {
  "worklet";
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame === undefined) continue;
    if (y < frame.y) return i;
    if (y <= frame.y + frame.height && x < frame.x + frame.width / 2) return i;
  }
  return frames.length;
}

// Per-frame increments rather than a velocity ramp, matching DraggableFlashList:
// the scroll runs on the UI thread and the drop target is recomputed from it, so
// a large jump would skip over rows the caret never got to point at.
function autoScrollVelocityFor(y: number, viewportHeight: number): number {
  "worklet";
  if (viewportHeight <= 0) return 0;
  const threshold = Math.min(AUTO_SCROLL_THRESHOLD, viewportHeight / 4);
  const depth =
    y < threshold
      ? y - threshold
      : y > viewportHeight - threshold
        ? y - (viewportHeight - threshold)
        : 0;
  if (depth === 0) return 0;
  const ratio = Math.min(1, Math.abs(depth) / threshold);
  const step =
    AUTO_SCROLL_MIN_STEP +
    (AUTO_SCROLL_MAX_STEP - AUTO_SCROLL_MIN_STEP) * ratio;
  return depth < 0 ? -step : step;
}

type CellProps = {
  index: number;
  activeIndex: SharedValue<number>;
  onMeasure: (index: number, layout: Frame) => void;
  children: ReactElement;
};

const SortableBadgeCell = memo(
  ({ index, activeIndex, onMeasure, children }: CellProps) => {
    const style = useAnimatedStyle(
      () => ({
        opacity: activeIndex.value === index ? ACTIVE_BADGE_OPACITY : 1,
      }),
      [index],
    );
    return (
      <Animated.View
        style={style}
        onLayout={(event) => onMeasure(index, event.nativeEvent.layout)}
      >
        {children}
      </Animated.View>
    );
  },
);

SortableBadgeCell.displayName = "SortableBadgeCell";

type SortableBadgeWrapProps<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderBadge: (item: T, index: number, isActive: boolean) => ReactElement;
  onSort: (fromIndex: number, toIndex: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
  gap?: number;
  caretColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Long-press drag reorder for a wrapping row of variable-width badges.
 *
 * `DraggableFlashList` can't cover this: it resolves the pressed row by
 * `floor(y / itemHeight)`, which only works for a single column of fixed-height
 * rows. Everything else is the same architecture — a single gesture on the
 * container, hit testing on the UI thread, auto-scroll driven from a frame
 * callback, and the order owned by the caller.
 *
 * The badges own their scroller rather than borrowing the parent's, which keeps
 * the two coordinate spaces one subtraction apart: the gesture sits on the
 * viewport (so touches are viewport-relative, which is what the auto-scroll
 * edges need) while the badges are laid out in the scroll content (so measured
 * frames are content-relative, which is what hit testing needs).
 *
 * The badges deliberately do not reflow mid-drag (a wrap relayout would move
 * every badge after the gap, on every frame): the drop target is shown as a
 * caret instead, and the grid settles once on drop.
 */
export default function SortableBadgeWrap<T>({
  data,
  keyExtractor,
  renderBadge,
  onSort,
  onDragStateChange,
  gap = DEFAULT_GAP,
  caretColor = "#10b981",
  style,
}: SortableBadgeWrapProps<T>) {
  const [drag, setDrag] = useState<{ index: number; item: T } | null>(null);

  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  // Where the auto-scroll believes the content is: `scrollOffset` only catches
  // up once native reports the scroll back, a frame or more behind the drag.
  const scrollTarget = useSharedValue(0);
  const autoScrollVelocity = useSharedValue(0);
  const viewportHeight = useSharedValue(0);
  const contentHeight = useSharedValue(0);

  const frames = useSharedValue<Frame[]>([]);
  const activeIndex = useSharedValue(-1);
  const insertSlot = useSharedValue(-1);
  const activeFrame = useSharedValue<Frame>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const startContentX = useSharedValue(0);
  const startContentY = useSharedValue(0);
  // The last touch in viewport space, so a finger held still at an edge can be
  // re-projected into content space on every auto-scrolled frame.
  const touchViewportX = useSharedValue(0);
  const touchViewportY = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const isDropping = useSharedValue(false);

  // Measured frames live in a ref and are published as a fresh array: a shared
  // value mutated in place would never reach the UI thread.
  const framesRef = useRef<Frame[]>([]);
  const onMeasure = useStableCallback((index: number, layout: Frame) => {
    framesRef.current[index] = layout;
    frames.value = [...framesRef.current];
  });

  useEffect(() => {
    if (framesRef.current.length > data.length) {
      framesRef.current.length = data.length;
      frames.value = [...framesRef.current];
    }
  }, [data.length, frames]);

  // Cleared here rather than on the UI thread in `endDrag` so the overlay stops
  // being positioned in the very commit that unmounts it; zeroing it a JS hop
  // earlier snaps the badge back to its source slot for a frame first.
  useLayoutEffect(() => {
    if (drag !== null) return;
    activeIndex.value = -1;
    insertSlot.value = -1;
    dragX.value = 0;
    dragY.value = 0;
    isDropping.value = false;
  }, [drag, activeIndex, insertSlot, dragX, dragY, isDropping]);

  const onViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.value = event.nativeEvent.layout.height;
    },
    [viewportHeight],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.value = height;
    },
    [contentHeight],
  );

  const beginDrag = useStableCallback((index: number) => {
    const item = data[index];
    if (item === undefined) {
      activeIndex.value = -1;
      insertSlot.value = -1;
      return;
    }
    selectionHaptic();
    setDrag({ index, item });
    onDragStateChange?.(true);
  });

  const commitDrag = useStableCallback((fromIndex: number, slot: number) => {
    autoScrollVelocity.value = 0;
    // Also cleared by the effect above, but that only runs when `drag` actually
    // changes — a drag released before its overlay ever mounted would leave
    // these latched and block every later drag.
    activeIndex.value = -1;
    insertSlot.value = -1;
    isDropping.value = false;
    setDrag(null);
    onDragStateChange?.(false);
    // The dragged badge still occupies its old position while the slot is
    // measured, so every drop target past it is one slot too far.
    const toIndex = Math.min(
      Math.max(0, data.length - 1),
      slot > fromIndex ? slot - 1 : slot,
    );
    if (toIndex !== fromIndex) onSort(fromIndex, toIndex);
  });

  const endDrag = useCallback(() => {
    "worklet";
    const fromIndex = activeIndex.value;
    if (fromIndex < 0 || isDropping.value) return;
    isDropping.value = true;
    const slot = insertSlot.value;
    autoScrollVelocity.value = 0;
    scheduleOnRN(commitDrag, fromIndex, slot < 0 ? fromIndex : slot);
  }, [activeIndex, insertSlot, isDropping, autoScrollVelocity, commitDrag]);

  // Memoised because `useFrameCallback` re-registers whenever the callback
  // changes identity, which would otherwise be every render.
  const autoScroll = useFrameCallback(
    useCallback(() => {
      "worklet";
      const velocity = autoScrollVelocity.value;
      if (velocity === 0) {
        scrollTarget.value = scrollOffset.value;
        return;
      }
      const maxOffset = Math.max(0, contentHeight.value - viewportHeight.value);
      const next = Math.min(
        maxOffset,
        Math.max(0, scrollTarget.value + velocity),
      );
      if (next === scrollTarget.value) return;
      scrollTarget.value = next;
      scrollTo(scrollRef, 0, next, false);
      // The finger stands still while the badges slide under it, so the drop
      // target and the dragged badge both have to follow the scroll rather than
      // the pan.
      const contentY = touchViewportY.value + next;
      insertSlot.value = slotAt(frames.value, touchViewportX.value, contentY);
      dragY.value = contentY - startContentY.value;
    }, [
      autoScrollVelocity,
      scrollTarget,
      scrollOffset,
      scrollRef,
      contentHeight,
      viewportHeight,
      touchViewportX,
      touchViewportY,
      startContentY,
      insertSlot,
      frames,
      dragY,
    ]),
    false,
  );

  useEffect(() => {
    autoScroll.setActive(drag !== null);
  }, [drag, autoScroll]);

  // Every callback reads shared values only, so the gesture config — and with
  // it the registered handler — stays identical across renders.
  const panGesture = usePanGesture(
    useMemo(
      () => ({
        manualActivation: true,
        shouldCancelWhenOutside: false,
        onTouchesMove: (event: GestureTouchEvent) => {
          "worklet";
          if (activeIndex.value >= 0) {
            GestureStateManager.activate(event.handlerTag);
            return;
          }
          // Failing the pan is what lets the badges scroll, but it is
          // irreversible: fail it on the first pixel of jitter and the long
          // press that follows would arm a drag no touch could ever move.
          const touch = event.allTouches[0];
          if (touch === undefined) return;
          const dx = touch.x - touchStartX.value;
          const dy = touch.y - touchStartY.value;
          if (
            dx * dx + dy * dy >
            DRAG_ACTIVATION_MAX_DISTANCE * DRAG_ACTIVATION_MAX_DISTANCE
          ) {
            GestureStateManager.deactivate(event.handlerTag);
          }
        },
        onBegin: (event: { x: number; y: number }) => {
          "worklet";
          touchStartX.value = event.x;
          touchStartY.value = event.y;
        },
        onUpdate: (event: { x: number; y: number }) => {
          "worklet";
          if (activeIndex.value < 0 || isDropping.value) return;
          const contentY = event.y + scrollTarget.value;
          touchViewportX.value = event.x;
          touchViewportY.value = event.y;
          dragX.value = event.x - startContentX.value;
          dragY.value = contentY - startContentY.value;
          insertSlot.value = slotAt(frames.value, event.x, contentY);
          autoScrollVelocity.value = autoScrollVelocityFor(
            event.y,
            viewportHeight.value,
          );
        },
        // `onFinalize` rather than `onEnd`: it also covers the drag that was
        // armed and released without the pan ever going active.
        onFinalize: () => {
          "worklet";
          endDrag();
        },
      }),
      [
        activeIndex,
        insertSlot,
        isDropping,
        frames,
        dragX,
        dragY,
        startContentX,
        startContentY,
        touchStartX,
        touchStartY,
        touchViewportX,
        touchViewportY,
        scrollTarget,
        autoScrollVelocity,
        viewportHeight,
        endDrag,
      ],
    ),
  );

  // Read out of the gesture before the worklet below: a worklet closure
  // captures whole objects, and serializing `panGesture` freezes it, leaving
  // RNGH unable to attach the composition's relations to it.
  const panHandlerTag = panGesture.handlerTag;

  const longPressGesture = useLongPressGesture(
    useMemo(
      () => ({
        minDuration: DRAG_ACTIVATION_DURATION,
        maxDistance: DRAG_ACTIVATION_MAX_DISTANCE,
        shouldCancelWhenOutside: false,
        onActivate: (event: { x: number; y: number }) => {
          "worklet";
          if (activeIndex.value >= 0 || isDropping.value) return;
          // The frame callback only runs during a drag, so this is where a
          // scroll made since the last one is folded back in.
          const scroll = scrollOffset.value;
          scrollTarget.value = scroll;
          const contentY = event.y + scroll;
          const index = badgeAt(frames.value, event.x, contentY);
          if (index < 0) return;
          const frame = frames.value[index];
          if (frame === undefined) return;
          activeIndex.value = index;
          insertSlot.value = index;
          activeFrame.value = frame;
          startContentX.value = event.x;
          startContentY.value = contentY;
          touchViewportX.value = event.x;
          touchViewportY.value = event.y;
          dragX.value = 0;
          dragY.value = 0;
          autoScrollVelocity.value = 0;
          // The long press itself cancels once the finger travels past
          // `maxDistance`, so the pan — which outlives it — owns the drag from
          // here, including the drop.
          GestureStateManager.activate(panHandlerTag);
          scheduleOnRN(beginDrag, index);
        },
      }),
      [
        activeIndex,
        insertSlot,
        isDropping,
        activeFrame,
        frames,
        dragX,
        dragY,
        startContentX,
        startContentY,
        touchViewportX,
        touchViewportY,
        scrollOffset,
        scrollTarget,
        autoScrollVelocity,
        beginDrag,
        panHandlerTag,
      ],
    ),
  );

  const gesture = useSimultaneousGestures(longPressGesture, panGesture);

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: activeFrame.value.x + dragX.value },
      { translateY: activeFrame.value.y + dragY.value },
      { scale: 1.05 },
    ],
  }));

  // Every branch returns the same keys: a style whose shape changes between
  // frames is what makes Reanimated fall back to a full JS style diff.
  const caretStyle = useAnimatedStyle(() => {
    const slot = insertSlot.value;
    const list = frames.value;
    const frame = slot < 0 ? undefined : list[Math.min(slot, list.length - 1)];
    if (frame === undefined) {
      return { opacity: 0, height: 0, transform: [] };
    }
    const x = slot >= list.length ? frame.x + frame.width + gap : frame.x;
    return {
      opacity: 1,
      height: frame.height,
      transform: [
        { translateX: x - gap / 2 - CARET_WIDTH / 2 },
        { translateY: frame.y },
      ],
    };
  }, [gap]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={style} onLayout={onViewportLayout}>
        <ScrollView
          ref={scrollRef}
          scrollEnabled={drag === null}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={onContentSizeChange}
          contentContainerStyle={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap,
          }}
        >
          {data.map((item, index) => (
            <SortableBadgeCell
              key={keyExtractor(item, index)}
              index={index}
              activeIndex={activeIndex}
              onMeasure={onMeasure}
            >
              {renderBadge(item, index, false)}
            </SortableBadgeCell>
          ))}
          {drag !== null && (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: CARET_WIDTH,
                    borderRadius: CARET_WIDTH / 2,
                    backgroundColor: caretColor,
                  },
                  caretStyle,
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  { position: "absolute", top: 0, left: 0 },
                  overlayStyle,
                ]}
              >
                {renderBadge(drag.item, drag.index, true)}
              </Animated.View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
