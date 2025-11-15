import { FlashList, type FlashListProps } from "@shopify/flash-list";
import React, {
  type FunctionComponent,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  forwardRef,
  type PropsWithChildren,
} from "react";
import {
  type LayoutChangeEvent,
  Platform,
  View,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView,
  createNativeWrapper,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  type SharedValue,
  withSpring,
  useAnimatedReaction,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const AnimatedCellContainer = Animated.createAnimatedComponent(View);

type ItemWrapperProps = PropsWithChildren<{
  index: number;
  activeIndex: SharedValue<number>;
  insertIndex: SharedValue<number>;
  itemHeight: number;
  isActive: boolean;
  style?: ViewStyle;
}>;

const ItemWrapper = forwardRef<View, ItemWrapperProps>((props, ref) => {
  const { isActive, itemHeight, insertIndex, activeIndex, index } = props;

  const position = useSharedValue(0);

  useAnimatedReaction(
    () => insertIndex.value,
    (newInsertIndex) => {
      if (newInsertIndex < 0 || activeIndex.value < 0) {
        position.value = withSpring(0);
        return;
      }
      if (index > activeIndex.value && index <= newInsertIndex + 0.5) {
        position.value = withSpring(-itemHeight);
        return;
      }
      if (index < activeIndex.value && index >= newInsertIndex - 0.5) {
        position.value = withSpring(itemHeight);
        return;
      }
      if (position.value !== 0) {
        position.value = withSpring(0);
      }
    },
    [index, itemHeight],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (isActive && activeIndex.value === index) {
      return {
        opacity: 0,
        transform: [{ translateY: 0 }],
      };
    }
    return {
      opacity: 1,
      transform: [{ translateY: position.value }],
    };
  }, [index, isActive]);

  return (
    <AnimatedCellContainer ref={ref} {...props} style={props.style}>
      <Animated.View style={animatedStyle}>{props.children}</Animated.View>
    </AnimatedCellContainer>
  );
});

ItemWrapper.displayName = "ItemWrapper";

const GestureFlashList = createNativeWrapper(FlashList);
const AnimatedFlashList = Animated.createAnimatedComponent(GestureFlashList);

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
  ) => JSX.Element;
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
  const avoidDataUpdate = useRef(false);

  const isIOS = Platform.OS === "ios";

  useEffect(() => {
    if (avoidDataUpdate.current) return;
    setData(props.data);
  }, [props.data]);

  const [layout, setLayout] = useState<Layout | null>(null);
  const scrollViewRef = useRef<typeof FlashList<T>>(null);

  const activeIndex = useSharedValue(-1);
  const [activeIndexState, setActiveIndexState] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const insertIndex = useSharedValue(-1);

  const scrollOffset = useSharedValue(0);
  const autoScrollVelocity = useSharedValue(0);
  const autoScrollAcceleration = useSharedValue(1);
  const scrollIntervalRef = useRef<NodeJS.Timeout | number | null>(null);
  const fromIndexRef = useRef<number>(-1);
  const toIndexRef = useRef<number>(-1);

  const dragPosition = useSharedValue(0);
  const dragScrollOffset = useSharedValue(0);
  const dragOffset = useSharedValue(0);

  const endDrag = useCallback(
    (fromIndex: number, toIndex: number) => {
      const endAnimationDuration = 300;
      dragPosition.value = withTiming(
        toIndex * itemHeight + itemHeight / 2 - scrollOffset.value,
        {
          duration: endAnimationDuration,
        },
      );

      setTimeout(() => {
        const changed = fromIndex !== toIndex;
        avoidDataUpdate.current = true;

        if (changed) {
          const copy = [...data];
          const removed = copy.splice(fromIndex, 1);
          if (removed[0]) {
            copy.splice(toIndex, 0, removed[0]);
            setData(copy);
          }
        }

        dragOffset.value = 0;
        dragPosition.value = -1;
        dragScrollOffset.value = 0;
        activeIndex.value = -1;
        setActiveIndexState(-1);
        insertIndex.value = -1;
        autoScrollVelocity.value = 0;
        autoScrollAcceleration.value = 1;
        setIsDragging(false);
        fromIndexRef.current = fromIndex;
        toIndexRef.current = toIndex;

        if (changed && props.onSort) {
          props.onSort(fromIndex, toIndex);
        }

        avoidDataUpdate.current = false;
      }, endAnimationDuration + 1);
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
      autoScrollVelocity,
      autoScrollAcceleration,
    ],
  );

  const beginDrag = useCallback(
    (index: number) => {
      activeIndex.value = index;
      setActiveIndexState(index);
      setIsDragging(true);
    },
    [activeIndex],
  );

  useEffect(() => {
    if (isDragging) {
      if (!scrollIntervalRef.current) {
        scrollIntervalRef.current = setInterval(() => {
          if (!scrollViewRef.current || autoScrollVelocity.value === 0) return;
          scrollViewRef.current.scrollToOffset({
            offset:
              scrollOffset.value +
              autoScrollVelocity.value *
                autoScrollSpeed *
                autoScrollAcceleration.value,
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

  const panGesture = Gesture.Pan()
    .manualActivation(isIOS)
    .enabled(layout !== null)
    .shouldCancelWhenOutside(false)
    .onTouchesMove((_evt, stateManager) => {
      "worklet";
      if (!isIOS) return;
      if (isDragging || activeIndexState >= 0 || activeIndex.value >= 0) {
        stateManager.activate();
      } else {
        stateManager.end();
      }
    })
    .onBegin((evt) => {
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
    })
    .onUpdate((evt) => {
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
    })
    .onEnd(() => {
      "worklet";
      if (activeIndex.value < 0) return;
      const fromIndex = activeIndex.value;
      const toIndex = Math.round(insertIndex.value);
      scheduleOnRN(endDrag, fromIndex, toIndex);
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
        isDragging && activeIndex.value === index,
        () => beginDrag(index),
      );
    },
    [props, isDragging, activeIndex, beginDrag],
  );

  const draggingAnimatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value < 0) {
      return {
        opacity: 0,
        transform: [{ translateY: 0 }],
      };
    }
    return {
      opacity: 1,
      transform: [
        {
          translateY: dragPosition.value - itemHeight / 2,
        },
      ],
    };
  }, [itemHeight, dragPosition, activeIndex]);

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
          // @ts-expect-error - FlashList ref type
          ref={scrollViewRef}
          data={data}
          renderItem={renderItem}
          CellRendererComponent={(rowProps) => (
            <ItemWrapper
              {...rowProps}
              activeIndex={activeIndex}
              insertIndex={insertIndex}
              itemHeight={itemHeight}
              isActive={isDragging}
            />
          )}
          scrollEnabled={(props.scrollEnabled ?? true) && !isDragging}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          extraData={extraData}
          renderScrollComponent={ScrollView}
        />
        {isDragging && activeIndexState >= 0 && data[activeIndexState] && (
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
              data[activeIndexState],
              activeIndexState,
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
