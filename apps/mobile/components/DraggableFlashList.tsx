import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
} from "@shopify/flash-list";
import {
  createContext,
  forwardRef,
  isValidElement,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  View,
  type ViewStyle,
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
  Easing,
  makeMutable,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import useStableCallback from "@/hooks/useStableCallback";
import { selectionHaptic } from "@/services/haptics";

const AnimatedCellContainer = Animated.createAnimatedComponent(View);

const AUTO_SCROLL_THRESHOLD = 100;
// Per-frame increments, not a velocity ramp: the scroll runs on the UI thread
// but FlashList still produces cells on the JS one, so outrunning it by much
// slides the viewport into rows that were never rendered.
const AUTO_SCROLL_MIN_STEP = 2;
const AUTO_SCROLL_MAX_STEP = 10;
// Roughly 1.5s of pre-rendered runway at the top speed above, against the ~0.7s
// Android's default 250 leaves.
const DRAG_DRAW_DISTANCE = 900;
const DRAG_ACTIVATION_DURATION = 220;
const DRAG_ACTIVATION_MAX_DISTANCE = 24;
const DROP_ANIMATION_DURATION = 180;
const SHIFT_ANIMATION = { duration: 200, easing: Easing.out(Easing.ease) };

function autoScrollStep(depth: number) {
  "worklet";
  const ratio = Math.min(1, depth / AUTO_SCROLL_THRESHOLD);
  return (
    AUTO_SCROLL_MIN_STEP + (AUTO_SCROLL_MAX_STEP - AUTO_SCROLL_MIN_STEP) * ratio
  );
}

type DragState = {
  activeIndex: SharedValue<number>;
  insertIndex: SharedValue<number>;
  hiddenSlot: SharedValue<number>;
  itemHeight: SharedValue<number>;
};

// Cells read the drag state through context so `CellRendererComponent` can stay
// a stable module-scope component: FlashList compares it by reference and uses
// it as the cell's element type, so a new identity remounts every mounted cell.
const DragContext = createContext<DragState>({
  activeIndex: makeMutable(-1),
  insertIndex: makeMutable(-1),
  hiddenSlot: makeMutable(-1),
  itemHeight: makeMutable(0),
});

type CellProps = PropsWithChildren<{
  index: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

const ItemWrapper = forwardRef<View, CellProps>((props, ref) => {
  const { index } = props;
  const { activeIndex, insertIndex, hiddenSlot, itemHeight } =
    useContext(DragContext);

  const position = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const insert = insertIndex.value;
      const active = activeIndex.value;
      let offset = 0;
      if (insert >= 0 && active >= 0) {
        if (index > active && index <= insert + 0.5) offset = -itemHeight.value;
        else if (index < active && index >= insert - 0.5)
          offset = itemHeight.value;
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
      // Land immediately when the cell was just recycled onto another row (so it
      // never animates from the previous row's offset) and when the drag just
      // ended (the reordered data lands in the same commit, so the shifted rows
      // are already where they belong).
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
    <AnimatedCellContainer
      ref={ref}
      {...props}
      style={[props.style, animatedStyle]}
    />
  );
});

ItemWrapper.displayName = "ItemWrapper";

type DraggableFlashListProps<T> = Omit<
  FlashListProps<T>,
  "renderItem" | "data"
> & {
  data: T[];
  itemHeight: number;
  onSort?: (fromIndex: number, toIndex: number) => void;
  renderItem: (
    item: T,
    index: number,
    isActive: boolean,
    beginDrag: () => void,
  ) => ReactElement;
  keyExtractor: (item: T, index: number) => string;
};

const noop = () => {};

function DraggableFlashList<T>({
  data,
  itemHeight,
  onSort,
  renderItem,
  drawDistance,
  maintainVisibleContentPosition,
  scrollEnabled,
  ListHeaderComponent,
  ...listProps
}: DraggableFlashListProps<T>) {
  // The order lives in the caller: committing it here as well would mean two
  // sources of truth reordering at slightly different times on drop.
  const [drag, setDrag] = useState<{ index: number; item: T } | null>(null);
  const listRef = useAnimatedRef<FlashListRef<T>>();
  const scrollOffset = useScrollOffset(listRef);

  const activeIndex = useSharedValue(-1);
  const insertIndex = useSharedValue(-1);
  const hiddenSlot = useSharedValue(-1);
  const itemHeightValue = useSharedValue(itemHeight);
  const maxIndex = useSharedValue(Math.max(0, data.length - 1));
  const layoutHeight = useSharedValue(0);
  // The header scrolls with the rows, so every touch/offset below has to be
  // converted into row space by taking its height back out.
  const headerHeight = useSharedValue(0);
  // Where the auto-scroll believes the list is: `scrollOffset` only catches up
  // once native reports the scroll back, a frame or more behind the drag.
  const scrollTarget = useSharedValue(0);
  const autoScrollVelocity = useSharedValue(0);
  const dragPosition = useSharedValue(0);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const isDropping = useSharedValue(false);

  useEffect(() => {
    itemHeightValue.value = itemHeight;
  }, [itemHeight, itemHeightValue]);

  useEffect(() => {
    maxIndex.value = Math.max(0, data.length - 1);
  }, [data.length, maxIndex]);

  useEffect(() => {
    if (!ListHeaderComponent) headerHeight.value = 0;
  }, [ListHeaderComponent, headerHeight]);

  const dragContext = useMemo<DragState>(
    () => ({
      activeIndex,
      insertIndex,
      hiddenSlot,
      itemHeight: itemHeightValue,
    }),
    [activeIndex, insertIndex, hiddenSlot, itemHeightValue],
  );

  // Cleared here rather than in `commitDrag` so the rows snap back to zero in
  // the very commit that renders the reordered data.
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
    activeIndex.value = index;
    // Hiding the in-list row before its overlay exists would leave a one-frame
    // hole where the row is simply gone.
    hiddenSlot.value = index;
    selectionHaptic();
    setDrag({ index, item });
  });

  const commitDrag = useStableCallback((fromIndex: number, toIndex: number) => {
    dragPosition.value = 0;
    autoScrollVelocity.value = 0;
    // Also cleared by the effect below, but that only runs when `drag` actually
    // changes — a drag released before its overlay mounted would leave the
    // guard latched and block every later drop.
    isDropping.value = false;
    setDrag(null);
    const target = Math.min(toIndex, Math.max(0, data.length - 1));
    if (fromIndex !== target) onSort?.(fromIndex, target);
  });

  const isDragging = drag !== null;

  // Reachable from both the pan (finger lifted mid-drag) and the long press
  // (held and released without ever moving), so it has to be idempotent.
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
    // The reorder is committed from the completion callback: applying it up
    // front would relayout the list underneath the still-animating row.
    dragPosition.value = withTiming(
      headerHeight.value +
        toIndex * itemHeightValue.value +
        itemHeightValue.value / 2 -
        scrollTarget.value,
      { duration: DROP_ANIMATION_DURATION },
      () => {
        "worklet";
        scheduleOnRN(commitDrag, fromIndex, toIndex);
      },
    );
  }, [
    activeIndex,
    insertIndex,
    isDropping,
    maxIndex,
    itemHeightValue,
    headerHeight,
    scrollTarget,
    autoScrollVelocity,
    dragPosition,
    commitDrag,
  ]);

  // Memoised because `useFrameCallback` re-registers whenever the callback
  // changes identity, which would otherwise be every render of the list.
  const autoScroll = useFrameCallback(
    useCallback(() => {
      "worklet";
      const velocity = autoScrollVelocity.value;
      if (velocity === 0) {
        scrollTarget.value = scrollOffset.value;
        return;
      }
      const maxOffset = Math.max(
        0,
        headerHeight.value +
          itemHeightValue.value * (maxIndex.value + 1) -
          layoutHeight.value,
      );
      const next = Math.min(
        maxOffset,
        Math.max(0, scrollTarget.value + velocity),
      );
      if (next === scrollTarget.value) return;
      scrollTarget.value = next;
      scrollTo(listRef, 0, next, false);
      // The finger stands still while the content slides under it, so the gap
      // has to follow the scroll rather than the pan.
      insertIndex.value = Math.min(
        maxIndex.value,
        Math.max(
          0,
          (next + dragPosition.value - headerHeight.value) /
            itemHeightValue.value -
            0.5,
        ),
      );
    }, [
      autoScrollVelocity,
      scrollTarget,
      scrollOffset,
      itemHeightValue,
      maxIndex,
      layoutHeight,
      headerHeight,
      insertIndex,
      dragPosition,
      listRef,
    ]),
    false,
  );

  useEffect(() => {
    autoScroll.setActive(isDragging);
  }, [isDragging, autoScroll]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutHeight.value = event.nativeEvent.layout.height;
    },
    [layoutHeight],
  );

  const onHeaderLayout = useCallback(
    (event: LayoutChangeEvent) => {
      headerHeight.value = event.nativeEvent.layout.height;
    },
    [headerHeight],
  );

  // Wrapped rather than forwarded so its height can be measured. Kept an
  // element rather than a component: a fresh component *type* on every content
  // change would remount the whole header instead of reconciling it.
  const headerComponent = useMemo(() => {
    if (!ListHeaderComponent) return undefined;
    return (
      <View onLayout={onHeaderLayout}>
        {isValidElement(ListHeaderComponent) ? (
          ListHeaderComponent
        ) : (
          <ListHeaderComponent />
        )}
      </View>
    );
  }, [ListHeaderComponent, onHeaderLayout]);

  // Every callback reads shared values only, so the config — and with it the
  // registered gesture — stays identical across renders.
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
          // Failing the pan is what frees the list to scroll, but it is
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
          if (activeIndex.value >= 0 || layoutHeight.value <= 0) return;
          const half = itemHeightValue.value / 2;
          const y = Math.min(
            layoutHeight.value - half,
            Math.max(half, event.y),
          );
          touchStartX.value = event.x;
          touchStartY.value = event.y;
          scrollTarget.value = scrollOffset.value;
          dragPosition.value = y;
          insertIndex.value = Math.max(
            0,
            (scrollTarget.value + y - headerHeight.value) /
              itemHeightValue.value -
              0.5,
          );
        },
        onUpdate: (event: { y: number }) => {
          "worklet";
          if (activeIndex.value < 0 || layoutHeight.value <= 0) return;
          if (isDropping.value) return;
          const half = itemHeightValue.value / 2;
          const y = Math.min(
            layoutHeight.value - half,
            Math.max(half, event.y),
          );
          dragPosition.value = y;
          insertIndex.value = Math.min(
            maxIndex.value,
            Math.max(
              0,
              (scrollTarget.value + y - headerHeight.value) /
                itemHeightValue.value -
                0.5,
            ),
          );

          // Measured on the raw touch so the speed keeps rising as the finger
          // pushes past the edge, and drops to zero the moment it eases out.
          const below = event.y - (layoutHeight.value - AUTO_SCROLL_THRESHOLD);
          const above = AUTO_SCROLL_THRESHOLD - event.y;
          if (below > 0) {
            autoScrollVelocity.value = autoScrollStep(below);
          } else if (above > 0) {
            autoScrollVelocity.value = -autoScrollStep(above);
          } else {
            autoScrollVelocity.value = 0;
          }
        },
        // `onFinalize` rather than `onDeactivate`: it also covers the drag that
        // was armed and released without the pan ever going active.
        onFinalize: () => {
          "worklet";
          endDrag();
        },
      }),
      [
        activeIndex,
        insertIndex,
        isDropping,
        itemHeightValue,
        maxIndex,
        layoutHeight,
        headerHeight,
        scrollOffset,
        scrollTarget,
        touchStartX,
        touchStartY,
        autoScrollVelocity,
        dragPosition,
        endDrag,
      ],
    ),
  );

  // Read out of the gesture before the worklet below: a worklet closure captures
  // whole objects, and serializing `panGesture` freezes it, leaving RNGH unable
  // to attach the composition's relations to it.
  const panHandlerTag = panGesture.handlerTag;

  // Arming the drag from the UI thread is what makes the first frames of the
  // gesture usable: `activeIndex` and the pan's activation both land on the
  // thread the pan reads them from, with no JS round trip in between.
  const longPressGesture = useLongPressGesture(
    useMemo(
      () => ({
        minDuration: DRAG_ACTIVATION_DURATION,
        maxDistance: DRAG_ACTIVATION_MAX_DISTANCE,
        shouldCancelWhenOutside: false,
        onActivate: (event: { y: number }) => {
          "worklet";
          if (activeIndex.value >= 0 || layoutHeight.value <= 0) return;
          const offset = scrollOffset.value;
          const rowY = offset + event.y - headerHeight.value;
          // A press on the header belongs to no row.
          if (rowY < 0) return;
          // A fixed row height is what lets the pressed row be resolved by
          // arithmetic, including for rows FlashList never mounted.
          const index = Math.min(
            maxIndex.value,
            Math.max(0, Math.floor(rowY / itemHeightValue.value)),
          );
          const half = itemHeightValue.value / 2;
          scrollTarget.value = offset;
          activeIndex.value = index;
          insertIndex.value = index;
          dragPosition.value = Math.min(
            layoutHeight.value - half,
            Math.max(half, event.y),
          );
          // The long press itself cancels once the finger travels past
          // `maxDistance`, so the pan — which outlives it — owns the drag from
          // here, including the drop.
          GestureStateManager.activate(panHandlerTag);
          scheduleOnRN(beginDrag, index);
        },
      }),
      [
        activeIndex,
        insertIndex,
        itemHeightValue,
        maxIndex,
        layoutHeight,
        headerHeight,
        scrollOffset,
        scrollTarget,
        dragPosition,
        beginDrag,
        panHandlerTag,
      ],
    ),
  );

  const gesture = useSimultaneousGestures(longPressGesture, panGesture);

  // The active row is hidden in place and redrawn by the overlay below, so the
  // in-list copy never needs the active styling — keeping it out means grabbing
  // and dropping a row re-renders no cell at all.
  const renderListItem = useStableCallback(
    ({ item, index }: { item: T; index: number }) =>
      renderItem(item, index, false, () => beginDrag(index)),
  );

  const draggingAnimatedStyle = useAnimatedStyle(
    () => ({
      transform: [
        { translateY: dragPosition.value - itemHeightValue.value / 2 },
      ],
    }),
    [],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View onLayout={onLayout} style={{ flex: 1 }}>
        <DragContext.Provider value={dragContext}>
          <FlashList
            {...listProps}
            ref={listRef}
            data={data}
            renderItem={renderListItem}
            ListHeaderComponent={headerComponent}
            CellRendererComponent={ItemWrapper}
            // FlashList keeps the visible row pinned while data changes, which
            // makes a reorder shove the list around (documented known issue).
            maintainVisibleContentPosition={
              maintainVisibleContentPosition ?? { disabled: true }
            }
            scrollEnabled={(scrollEnabled ?? true) && !isDragging}
            drawDistance={isDragging ? DRAG_DRAW_DISTANCE : drawDistance}
            renderScrollComponent={ScrollView}
          />
        </DragContext.Provider>
        {drag && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                width: "100%",
                height: itemHeight,
              },
              draggingAnimatedStyle,
            ]}
          >
            {renderItem(drag.item, drag.index, true, noop)}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export default DraggableFlashList;
