import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  type GestureTouchEvent,
  useLongPressGesture,
  usePanGesture,
  useSimultaneousGestures,
} from "react-native-gesture-handler";
import Animated, {
  type AnimatedRef,
  Easing,
  measure,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import useStableCallback from "@/hooks/useStableCallback";
import { selectionHaptic } from "@/services/haptics";

// Same feel as DraggableList (queue and playlist reorder): a short hold arms
// the drag, moving first scrolls the screen instead.
const DRAG_ACTIVATION_DURATION = 220;
const DRAG_ACTIVATION_MAX_DISTANCE = 24;
const DROP_ANIMATION_DURATION = 180;
const SHIFT_ANIMATION = { duration: 200, easing: Easing.out(Easing.ease) };
const AUTO_SCROLL_THRESHOLD = 80;
const AUTO_SCROLL_MIN_STEP = 2;
const AUTO_SCROLL_MAX_STEP = 12;
// Auto-scroll stops once the sortable rows are fully in view, with this much
// room left between them and the edge.
const EDGE_PADDING = 16;

function autoScrollStep(depth: number, threshold: number) {
  "worklet";
  const ratio = Math.min(1, depth / threshold);
  return (
    AUTO_SCROLL_MIN_STEP + (AUTO_SCROLL_MAX_STEP - AUTO_SCROLL_MIN_STEP) * ratio
  );
}

type RowState = {
  activeIndex: SharedValue<number>;
  insertIndex: SharedValue<number>;
  hiddenSlot: SharedValue<number>;
  rowHeight: SharedValue<number>;
};

function SortableRow({
  index,
  state,
  onLayout,
  children,
}: {
  index: number;
  state: RowState;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const { activeIndex, insertIndex, hiddenSlot, rowHeight } = state;
  const position = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const insert = insertIndex.value;
      const active = activeIndex.value;
      let offset = 0;
      if (insert >= 0 && active >= 0) {
        if (index > active && index <= insert + 0.5) offset = -rowHeight.value;
        else if (index < active && index >= insert - 0.5)
          offset = rowHeight.value;
      }
      return { index, offset };
    },
    (current, previous) => {
      if (
        previous !== null &&
        previous.index === current.index &&
        previous.offset === current.offset
      ) {
        return;
      }
      // Land at once when the drag just ended: the reordered rows render in
      // the same commit, already where the shifted ones were drawn.
      if (
        previous === null ||
        previous.index !== current.index ||
        activeIndex.value < 0
      ) {
        position.value = current.offset;
        return;
      }
      position.value = withTiming(current.offset, SHIFT_ANIMATION);
    },
    [index],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (hiddenSlot.value === index) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }
    return { opacity: 1, transform: [{ translateY: position.value }] };
  }, [index]);

  return (
    <Animated.View style={animatedStyle} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

type SortableColumnProps<T> = {
  data: T[];
  // Only the leading rows reorder; the ones after stay where they are.
  sortableCount: number;
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number, isActive: boolean) => ReactElement;
  onSort: (fromIndex: number, toIndex: number) => void;
  // The screen's scroll view, which must be the gesture-handler one so an
  // armed drag wins the touch, and frozen through `onDragStateChange`.
  scrollRef: AnimatedRef<never>;
  scrollOffset: SharedValue<number>;
  // Chrome drawn over the bottom of that scroll view (tab bar, mini player).
  bottomInset?: number;
  onDragStateChange?: (dragging: boolean) => void;
};

// A short, non-virtualized drag-to-reorder column that lives inside a screen's
// scroll view, rows of equal height. The gesture recipe is DraggableList's.
function SortableColumn<T>({
  data,
  sortableCount,
  keyExtractor,
  renderItem,
  onSort,
  scrollRef,
  scrollOffset,
  bottomInset = 0,
  onDragStateChange,
}: SortableColumnProps<T>) {
  const [drag, setDrag] = useState<{ index: number; item: T } | null>(null);
  const columnRef = useAnimatedRef<Animated.View>();

  const activeIndex = useSharedValue(-1);
  const insertIndex = useSharedValue(-1);
  const hiddenSlot = useSharedValue(-1);
  const rowHeight = useSharedValue(0);
  const maxIndex = useSharedValue(sortableCount - 1);
  const bottomInsetValue = useSharedValue(bottomInset);
  const isDropping = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  // Window coordinates, captured when the drag is armed.
  const fingerY = useSharedValue(0);
  const columnTopAtArm = useSharedValue(0);
  const viewTop = useSharedValue(0);
  const viewBottom = useSharedValue(0);
  // Where the finger holds the row, from its top edge.
  const grabOffset = useSharedValue(0);
  const scrollAtArm = useSharedValue(0);
  // Where the auto-scroll put the screen: `scrollOffset` only catches up once
  // native reports the scroll back.
  const scrollTarget = useSharedValue(0);
  const autoScrollVelocity = useSharedValue(0);
  const overlayTop = useSharedValue(0);

  useEffect(() => {
    maxIndex.value = sortableCount - 1;
  }, [sortableCount, maxIndex]);

  useEffect(() => {
    bottomInsetValue.value = bottomInset;
  }, [bottomInset, bottomInsetValue]);

  const rowState = useMemo<RowState>(
    () => ({ activeIndex, insertIndex, hiddenSlot, rowHeight }),
    [activeIndex, insertIndex, hiddenSlot, rowHeight],
  );

  // Cleared here rather than in `commitDrag` so the rows snap back in the very
  // commit that renders the reordered data.
  useLayoutEffect(() => {
    if (drag !== null) return;
    activeIndex.value = -1;
    insertIndex.value = -1;
    hiddenSlot.value = -1;
    isDropping.value = false;
  }, [drag, activeIndex, insertIndex, hiddenSlot, isDropping]);

  const beginDrag = useStableCallback((index: number) => {
    const item = data[index];
    if (item === undefined) {
      activeIndex.value = -1;
      insertIndex.value = -1;
      return;
    }
    hiddenSlot.value = index;
    selectionHaptic();
    setDrag({ index, item });
    onDragStateChange?.(true);
  });

  const commitDrag = useStableCallback((fromIndex: number, toIndex: number) => {
    autoScrollVelocity.value = 0;
    isDropping.value = false;
    setDrag(null);
    onDragStateChange?.(false);
    if (fromIndex !== toIndex) onSort(fromIndex, toIndex);
  });

  const isDragging = drag !== null;

  // Moves the held row (and the gap) to wherever the finger now sits over the
  // column, which also moves when the screen scrolls under a still finger.
  const followFinger = useCallback(() => {
    "worklet";
    const columnTop =
      columnTopAtArm.value - (scrollTarget.value - scrollAtArm.value);
    const top = Math.min(
      maxIndex.value * rowHeight.value,
      Math.max(0, fingerY.value - columnTop - grabOffset.value),
    );
    overlayTop.value = top;
    insertIndex.value = Math.min(
      maxIndex.value,
      Math.max(0, top / rowHeight.value),
    );
  }, [
    columnTopAtArm,
    scrollTarget,
    scrollAtArm,
    maxIndex,
    rowHeight,
    fingerY,
    grabOffset,
    overlayTop,
    insertIndex,
  ]);

  const endDrag = useCallback(() => {
    "worklet";
    if (activeIndex.value < 0 || isDropping.value) return;
    isDropping.value = true;
    const fromIndex = activeIndex.value;
    const toIndex = Math.min(
      maxIndex.value,
      Math.max(0, Math.round(insertIndex.value)),
    );
    autoScrollVelocity.value = 0;
    // Committed from the completion callback: reordering up front would
    // relayout the column under the still-animating row.
    overlayTop.value = withTiming(
      toIndex * rowHeight.value,
      { duration: DROP_ANIMATION_DURATION },
      () => {
        "worklet";
        scheduleOnRN(commitDrag, fromIndex, toIndex);
      },
    );
  }, [
    activeIndex,
    isDropping,
    maxIndex,
    insertIndex,
    autoScrollVelocity,
    overlayTop,
    rowHeight,
    commitDrag,
  ]);

  const autoScroll = useFrameCallback(
    useCallback(() => {
      "worklet";
      const velocity = autoScrollVelocity.value;
      if (velocity === 0) return;
      const columnBottom =
        columnTopAtArm.value + (maxIndex.value + 1) * rowHeight.value;
      let next = scrollTarget.value + velocity;
      if (velocity > 0) {
        const visibleBottom = viewBottom.value - bottomInsetValue.value;
        next = Math.min(
          next,
          scrollAtArm.value + columnBottom + EDGE_PADDING - visibleBottom,
        );
        if (next <= scrollTarget.value) return;
      } else {
        next = Math.max(
          next,
          scrollAtArm.value +
            columnTopAtArm.value -
            EDGE_PADDING -
            viewTop.value,
          0,
        );
        if (next >= scrollTarget.value) return;
      }
      scrollTarget.value = next;
      scrollTo(scrollRef, 0, next, false);
      followFinger();
    }, [
      autoScrollVelocity,
      columnTopAtArm,
      maxIndex,
      rowHeight,
      scrollTarget,
      viewBottom,
      viewTop,
      bottomInsetValue,
      scrollAtArm,
      scrollRef,
      followFinger,
    ]),
    false,
  );

  useEffect(() => {
    autoScroll.setActive(isDragging);
  }, [isDragging, autoScroll]);

  const onFirstRowLayout = useCallback(
    (event: LayoutChangeEvent) => {
      rowHeight.value = event.nativeEvent.layout.height;
    },
    [rowHeight],
  );

  // Every callback reads shared values only, so the registered gesture stays
  // identical across renders.
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
          // Failing the pan is what frees the screen to scroll, so only once
          // the finger has clearly moved before the hold armed a drag.
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
          if (activeIndex.value >= 0) return;
          touchStartX.value = event.x;
          touchStartY.value = event.y;
        },
        onUpdate: (event: { absoluteY: number }) => {
          "worklet";
          if (activeIndex.value < 0 || isDropping.value) return;
          fingerY.value = event.absoluteY;
          followFinger();
          const visibleBottom = viewBottom.value - bottomInsetValue.value;
          const threshold = Math.min(
            AUTO_SCROLL_THRESHOLD,
            (visibleBottom - viewTop.value) / 4,
          );
          const below = event.absoluteY - (visibleBottom - threshold);
          const above = viewTop.value + threshold - event.absoluteY;
          if (below > 0) {
            autoScrollVelocity.value = autoScrollStep(below, threshold);
          } else if (above > 0) {
            autoScrollVelocity.value = -autoScrollStep(above, threshold);
          } else {
            autoScrollVelocity.value = 0;
          }
        },
        // Also covers a drag armed and released without the pan going active.
        onFinalize: () => {
          "worklet";
          endDrag();
        },
      }),
      [
        activeIndex,
        isDropping,
        touchStartX,
        touchStartY,
        fingerY,
        followFinger,
        viewBottom,
        viewTop,
        bottomInsetValue,
        autoScrollVelocity,
        endDrag,
      ],
    ),
  );

  // Read out of the gesture before the worklet below captures it: serializing
  // the gesture object would freeze it for RNGH.
  const panHandlerTag = panGesture.handlerTag;

  const longPressGesture = useLongPressGesture(
    useMemo(
      () => ({
        minDuration: DRAG_ACTIVATION_DURATION,
        maxDistance: DRAG_ACTIVATION_MAX_DISTANCE,
        shouldCancelWhenOutside: false,
        onActivate: (event: { y: number; absoluteY: number }) => {
          "worklet";
          if (activeIndex.value >= 0 || rowHeight.value <= 0) return;
          const index = Math.floor(event.y / rowHeight.value);
          if (index < 0 || index > maxIndex.value) return;
          const view = measure(scrollRef);
          const column = measure(columnRef);
          if (view === null || column === null) return;
          viewTop.value = view.pageY;
          viewBottom.value = view.pageY + view.height;
          columnTopAtArm.value = column.pageY;
          scrollAtArm.value = scrollOffset.value;
          scrollTarget.value = scrollOffset.value;
          fingerY.value = event.absoluteY;
          grabOffset.value = event.y - index * rowHeight.value;
          overlayTop.value = index * rowHeight.value;
          activeIndex.value = index;
          insertIndex.value = index;
          // The long press cancels once the finger travels past `maxDistance`,
          // so the pan, which outlives it, owns the drag and the drop.
          GestureStateManager.activate(panHandlerTag);
          scheduleOnRN(beginDrag, index);
        },
      }),
      [
        activeIndex,
        rowHeight,
        maxIndex,
        scrollRef,
        columnRef,
        viewTop,
        viewBottom,
        columnTopAtArm,
        scrollAtArm,
        scrollOffset,
        scrollTarget,
        fingerY,
        grabOffset,
        overlayTop,
        insertIndex,
        panHandlerTag,
        beginDrag,
      ],
    ),
  );

  const gesture = useSimultaneousGestures(longPressGesture, panGesture);

  const overlayStyle = useAnimatedStyle(
    () => ({ transform: [{ translateY: overlayTop.value }] }),
    [],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={columnRef}>
        {data.map((item, index) => (
          <SortableRow
            key={keyExtractor(item)}
            index={index}
            state={rowState}
            onLayout={index === 0 ? onFirstRowLayout : undefined}
          >
            {renderItem(item, index, false)}
          </SortableRow>
        ))}
        {drag && (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", top: 0, left: 0, right: 0 },
              overlayStyle,
            ]}
          >
            {renderItem(drag.item, drag.index, true)}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export default SortableColumn;
