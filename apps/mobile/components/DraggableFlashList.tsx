import {
  FlashList,
  type FlashListProps,
  type FlashListRef,
} from "@shopify/flash-list";
import {
  forwardRef,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type LayoutChangeEvent, View, type ViewStyle } from "react-native";
import {
  GestureDetector,
  GestureStateManager,
  ScrollView,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedCellContainer = Animated.createAnimatedComponent(View);

const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList,
) as unknown as typeof FlashList;

type ItemWrapperProps = PropsWithChildren<{
  index: number;
  activeIndex: SharedValue<number>;
  insertIndex: SharedValue<number>;
  hiddenSlot: SharedValue<number>;
  itemHeight: number;
  style?: ViewStyle;
}>;

const ItemWrapper = forwardRef<View, ItemWrapperProps>((props, ref) => {
  const { itemHeight, insertIndex, activeIndex, hiddenSlot, index } = props;

  const position = useSharedValue(0);

  useAnimatedReaction(
    () => {
      const insert = insertIndex.value;
      const active = activeIndex.value;
      if (insert < 0 || active < 0) return 0;
      if (index > active && index <= insert + 0.5) return -itemHeight;
      if (index < active && index >= insert - 0.5) return itemHeight;
      return 0;
    },
    (target, prev) => {
      if (target === prev) return;
      position.value = withSpring(target);
    },
    [index, itemHeight],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (hiddenSlot.value === index) {
      return {
        opacity: 0,
        transform: [{ translateY: 0 }],
      };
    }
    return {
      opacity: 1,
      transform: [{ translateY: position.value }],
    };
  }, [index]);

  return (
    <AnimatedCellContainer ref={ref} {...props} style={props.style}>
      <Animated.View style={animatedStyle}>{props.children}</Animated.View>
    </AnimatedCellContainer>
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
  autoScrollSpeed?: number;
  keyExtractor: (item: T, index: number) => string;
};

type Layout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const AUTO_SCROLL_THRESHOLD = 100;
const AUTO_SCROLL_SPEED = 3;

function DraggableFlashList<T>(props: DraggableFlashListProps<T>) {
  const { itemHeight, autoScrollSpeed = AUTO_SCROLL_SPEED } = props;

  const [data, setData] = useState(props.data);
  const [draggedSnapshot, setDraggedSnapshot] = useState<{
    item: T;
    index: number;
  } | null>(null);
  const optimisticDataRef = useRef<T[] | null>(null);
  const pendingResetRef = useRef(false);
  const { keyExtractor } = props;

  useEffect(() => {
    const expected = optimisticDataRef.current;
    if (expected && expected.length === props.data.length) {
      let same = true;
      for (let i = 0; i < expected.length; i++) {
        if (keyExtractor(expected[i], i) !== keyExtractor(props.data[i], i)) {
          same = false;
          break;
        }
      }
      if (same) {
        optimisticDataRef.current = null;
        return;
      }
    }
    optimisticDataRef.current = null;
    setData(props.data);
  }, [props.data, keyExtractor]);

  const [layout, setLayout] = useState<Layout | null>(null);
  const scrollViewRef = useRef<FlashListRef<T>>(null);

  const activeIndex = useSharedValue(-1);
  const [activeIndexState, setActiveIndexState] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const insertIndex = useSharedValue(-1);
  const hiddenSlot = useSharedValue(-1);

  const scrollOffset = useSharedValue(0);
  const autoScrollVelocity = useSharedValue(0);
  const autoScrollAcceleration = useSharedValue(1);
  const scrollIntervalRef = useRef<NodeJS.Timeout | number | null>(null);
  const fromIndexRef = useRef<number>(-1);
  const toIndexRef = useRef<number>(-1);

  const dragPosition = useSharedValue(0);
  const dragScrollOffset = useSharedValue(0);
  const dragOffset = useSharedValue(0);

  useLayoutEffect(() => {
    if (!pendingResetRef.current) return;
    pendingResetRef.current = false;
    activeIndex.value = -1;
    insertIndex.value = -1;
  }, [data, activeIndex, insertIndex]);

  const endDrag = useCallback(
    (fromIndex: number, toIndex: number) => {
      const endAnimationDuration = 180;
      const changed = fromIndex !== toIndex;

      dragPosition.value = withTiming(
        toIndex * itemHeight + itemHeight / 2 - scrollOffset.value,
        { duration: endAnimationDuration },
      );

      if (changed) {
        const copy = [...data];
        const removed = copy.splice(fromIndex, 1);
        if (removed[0]) {
          copy.splice(toIndex, 0, removed[0]);
          optimisticDataRef.current = copy;
          pendingResetRef.current = true;
          hiddenSlot.value = toIndex;
          setData(copy);
        }
      } else {
        activeIndex.value = -1;
        insertIndex.value = -1;
      }

      autoScrollVelocity.value = 0;
      autoScrollAcceleration.value = 1;
      fromIndexRef.current = fromIndex;
      toIndexRef.current = toIndex;

      if (changed && props.onSort) {
        props.onSort(fromIndex, toIndex);
      }

      setTimeout(() => {
        setIsDragging(false);
        setActiveIndexState(-1);
        setDraggedSnapshot(null);
        hiddenSlot.value = -1;
        dragOffset.value = 0;
        dragPosition.value = -1;
        dragScrollOffset.value = 0;
      }, endAnimationDuration);
    },
    [
      data,
      itemHeight,
      props,
      scrollOffset,
      dragPosition,
      dragOffset,
      dragScrollOffset,
      activeIndex,
      insertIndex,
      hiddenSlot,
      autoScrollVelocity,
      autoScrollAcceleration,
    ],
  );

  const beginDrag = useCallback(
    (index: number) => {
      activeIndex.value = index;
      hiddenSlot.value = index;
      setActiveIndexState(index);
      const item = data[index];
      if (item !== undefined) {
        setDraggedSnapshot({ item, index });
      }
      setIsDragging(true);
    },
    [activeIndex, hiddenSlot, data],
  );

  useEffect(() => {
    if (isDragging) {
      if (!scrollIntervalRef.current) {
        scrollIntervalRef.current = setInterval(() => {
          if (!scrollViewRef.current || autoScrollVelocity.value === 0) return;
          scrollViewRef.current.scrollToOffset({
            offset: Math.max(
              0,
              scrollOffset.value +
                autoScrollVelocity.value *
                  autoScrollSpeed *
                  autoScrollAcceleration.value,
            ),
            animated: false,
          });
          autoScrollAcceleration.value = Math.min(
            6,
            autoScrollAcceleration.value + 0.01,
          );
        }, 16);
      }
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [
    isDragging,
    autoScrollVelocity,
    autoScrollSpeed,
    autoScrollAcceleration,
    scrollOffset,
  ]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const onLayout = useCallback((evt: LayoutChangeEvent) => {
    setLayout(evt.nativeEvent.layout);
  }, []);

  const panGesture = usePanGesture({
    manualActivation: true,
    enabled: layout !== null,
    shouldCancelWhenOutside: false,
    onTouchesMove: (evt) => {
      "worklet";
      if (isDragging || activeIndexState >= 0 || activeIndex.value >= 0) {
        GestureStateManager.activate(evt.handlerTag);
      } else {
        GestureStateManager.deactivate(evt.handlerTag);
      }
    },
    onBegin: (evt) => {
      "worklet";
      if (activeIndex.value >= 0) return;
      let panAbsValue = Math.max(itemHeight / 2, evt.y);
      if (layout?.height) {
        panAbsValue = Math.min(layout.height - itemHeight / 2, panAbsValue);
      }
      dragPosition.value = panAbsValue;
      dragScrollOffset.value = scrollOffset.value;
      dragOffset.value = dragPosition.value;
      insertIndex.value = Math.max(
        0,
        (scrollOffset.value + dragPosition.value) / itemHeight - 0.5,
      );
    },
    onUpdate: (evt) => {
      "worklet";
      if (activeIndex.value < 0) return;
      let panAbsValue = Math.max(itemHeight / 2, evt.y);
      if (layout?.height) {
        panAbsValue = Math.min(layout.height - itemHeight / 2, panAbsValue);
      }
      dragPosition.value = panAbsValue;
      insertIndex.value = Math.max(
        0,
        (scrollOffset.value + dragPosition.value) / itemHeight - 0.5,
      );

      if (layout) {
        if (dragPosition.value >= layout.height - AUTO_SCROLL_THRESHOLD) {
          autoScrollVelocity.value = autoScrollSpeed;
        } else if (dragPosition.value < AUTO_SCROLL_THRESHOLD) {
          autoScrollVelocity.value = -autoScrollSpeed;
        } else {
          autoScrollAcceleration.value = 0;
          autoScrollVelocity.value = 0;
        }
      } else {
        autoScrollAcceleration.value = 0;
        autoScrollVelocity.value = 0;
      }
    },
    onDeactivate: () => {
      "worklet";
      if (activeIndex.value < 0) return;
      const fromIndex = activeIndex.value;
      const toIndex = Math.round(insertIndex.value);
      scheduleOnRN(endDrag, fromIndex, toIndex);
    },
  });

  const extraData = useMemo(
    () => ({
      isDragging,
    }),
    [isDragging],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: T; index: number }) => {
      return props.renderItem(
        item,
        index,
        isDragging && activeIndexState === index,
        () => beginDrag(index),
      );
    },
    [props, isDragging, activeIndexState, beginDrag],
  );

  const draggingAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: dragPosition.value - itemHeight / 2,
        },
      ],
    };
  }, [itemHeight, dragPosition]);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        onLayout={onLayout}
        style={{
          flex: 1,
        }}
      >
        <AnimatedFlashList
          {...props}
          ref={scrollViewRef}
          data={data}
          renderItem={renderItem}
          CellRendererComponent={(rowProps) => (
            <ItemWrapper
              {...rowProps}
              activeIndex={activeIndex}
              insertIndex={insertIndex}
              hiddenSlot={hiddenSlot}
              itemHeight={itemHeight}
            />
          )}
          scrollEnabled={(props.scrollEnabled ?? true) && !isDragging}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          extraData={extraData}
          renderScrollComponent={ScrollView}
        />
        {isDragging && draggedSnapshot && (
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
            {props.renderItem(
              draggedSnapshot.item,
              draggedSnapshot.index,
              true,
              () => {},
            )}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export default DraggableFlashList;
