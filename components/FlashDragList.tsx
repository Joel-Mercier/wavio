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
  height: number;
  active: boolean;
  style?: ViewStyle;
}>;

const ItemWrapper = forwardRef<View, ItemWrapperProps>((props, ref) => {
  const { active, height, insertIndex, activeIndex, index } = props;

  const position = useSharedValue(0);

  useEffect(() => {
    if (!active && position.value !== 0) position.value = withSpring(0);
  }, [active]);

  useAnimatedReaction(
    () => {
      return insertIndex.value;
    },
    (newInsertIndex) => {
      if (newInsertIndex < 0 || activeIndex.value < 0) {
        position.value = 0;
        return;
      }
      if (index > activeIndex.value && index <= newInsertIndex + 0.5) {
        position.value = withSpring(-height);
        return;
      }
      if (index < activeIndex.value && index >= newInsertIndex - 0.5) {
        position.value = withSpring(height);
        return;
      }
      if (position.value !== 0) {
        position.value = withSpring(0);
        return;
      }
    },
    [index, height, active],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (active && activeIndex.value === index) {
      return {
        opacity: 0,
        transform: [
          {
            translateY: 0,
          },
        ],
      };
    }
    return {
      opacity: 1,
      transform: [
        {
          translateY: position.value,
        },
      ],
    };
  }, [index, active]);

  return (
    <AnimatedCellContainer ref={ref} {...props} style={props.style}>
      <Animated.View style={animatedStyle}>{props.children}</Animated.View>
    </AnimatedCellContainer>
  );
});

const GestureFlashList = createNativeWrapper(FlashList);
const AnimatedFlashList = Animated.createAnimatedComponent(GestureFlashList);

type FlashDragListProps = Omit<FlashListProps<unknown>, "renderItem"> & {
  data: Array<unknown>;
  itemsSize: number;
  onSort?: (fromIndex: number, toIndex: number) => void;
  renderItem: (
    item: unknown,
    index: number,
    active: boolean,
    beginDrag: () => void,
  ) => JSX.Element;
  autoScrollSpeed?: number;
};

type Layout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const FlashDragList: FunctionComponent<FlashDragListProps> = (props) => {
  const { itemsSize } = props;

  const [data, setData] = useState(props.data);
  const avoidDataUpdate = useRef(false);

  const isIOS = Platform.OS === "ios";

  useEffect(() => {
    if (avoidDataUpdate.current) return;
    setData(props.data);
  });

  const [layout, setLayout] = useState<Layout | null>(null);

  const scrollview = useRef<typeof FlashList<unknown>>(null);

  const activeIndex = useSharedValue(-1);
  const [activeIndexState, setActiveIndexState] = useState(-1);
  const [active, setActive] = useState(false);
  const [callOnSort, setCallOnSort] = useState(false);
  const insertIndex = useSharedValue(-1);

  const scroll = useSharedValue(0);
  const autoScrollSpeed = useSharedValue(0);
  const autoScrollAcc = useSharedValue(1);
  const scrollInterval = useRef<NodeJS.Timeout | number | null>(null);
  const fromIndexRef = useRef<number>(-1);
  const toIndexRef = useRef<number>(-1);

  const panAbs = useSharedValue(0);
  const panScroll = useSharedValue(0);
  const panOffset = useSharedValue(0);

  const endDrag = (fromIndex: number, toIndex: number) => {
    const endAnimationDuration = 300;
    panAbs.value = withTiming(
      toIndex * itemsSize + itemsSize / 2 - scroll.value,
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
        copy.splice(toIndex, 0, removed[0]);
        setData(copy);
      }
      panOffset.value = 0;
      panAbs.value = -1;
      panScroll.value = 0;
      activeIndex.value = -1;
      setActiveIndexState(-1);
      insertIndex.value = -1;
      autoScrollSpeed.value = 0;
      autoScrollAcc.value = 1;
      setActive(false);
      fromIndexRef.current = fromIndex;
      toIndexRef.current = toIndex;
      if (changed) {
        setCallOnSort(true);
      }
    }, endAnimationDuration + 1);
  };

  useEffect(() => {
    if (!callOnSort || fromIndexRef.current < 0 || toIndexRef.current < 0)
      return;
    avoidDataUpdate.current = false;
    props.onSort?.(fromIndexRef.current, toIndexRef.current);
    setCallOnSort(false);
  }, [callOnSort]);

  const beginDrag = useCallback((index: number) => {
    activeIndex.value = index;
    setActiveIndexState(index);
    setActive(true);
  }, []);

  useEffect(() => {
    if (active) {
      if (!scrollInterval.current) {
        scrollInterval.current = setInterval(() => {
          if (!scrollview.current || autoScrollSpeed.value === 0) return;
          scrollview.current.scrollToOffset({
            offset:
              scroll.value +
              autoScrollSpeed.value *
                (props.autoScrollSpeed ?? 1) *
                autoScrollAcc.value,
            animated: false,
          });
          autoScrollAcc.value = Math.min(6, autoScrollAcc.value + 0.01);
        }, 16);
      }
    } else {
      if (scrollInterval.current) {
        clearInterval(scrollInterval.current);
        scrollInterval.current = null;
      }
    }
  }, [active]);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scroll.value = event.contentOffset.y;
  });

  const onLayout = useCallback((evt: LayoutChangeEvent) => {
    setLayout(evt.nativeEvent.layout);
  }, []);

  const panGesture = Gesture.Pan()
    .manualActivation(isIOS)
    .enabled(layout !== null)
    .shouldCancelWhenOutside(false)
    .onTouchesMove((_evt, stateManager) => {
      if (!isIOS) return;
      if (active || activeIndexState >= 0 || activeIndex.value >= 0)
        stateManager.activate();
      else stateManager.end();
    })
    .onBegin((evt) => {
      if (activeIndex.value >= 0) return;
      let panAbsValue = Math.max(itemsSize / 2, evt.y);
      if (layout?.height)
        panAbsValue = Math.min(layout.height - itemsSize / 2, panAbsValue);
      panAbs.value = panAbsValue;
      panScroll.value = scroll.value;
      panOffset.value = panAbs.value;
      insertIndex.value = Math.max(
        0,
        (scroll.value + panAbs.value) / itemsSize - 0.5,
      );
    })
    .onUpdate((evt) => {
      if (activeIndex.value < 0) return;
      let panAbsValue = Math.max(itemsSize / 2, evt.y);
      if (layout?.height)
        panAbsValue = Math.min(layout.height - itemsSize / 2, panAbsValue);
      panAbs.value = panAbsValue;
      insertIndex.value = Math.max(
        0,
        (scroll.value + panAbs.value) / itemsSize - 0.5,
      );
      if (layout) {
        if (panAbs.value >= layout.height - 100) autoScrollSpeed.value = 3;
        else if (panAbs.value < 100) autoScrollSpeed.value = -3;
        else {
          autoScrollAcc.value = 0;
          autoScrollSpeed.value = 0;
        }
      } else {
        autoScrollAcc.value = 0;
        autoScrollSpeed.value = 0;
      }
    })
    .onEnd(() => {
      if (activeIndex.value < 0) return;
      const fromIndex = activeIndex.value;
      const toIndex = Math.round(insertIndex.value);
      scheduleOnRN(endDrag, fromIndex, toIndex);
    });

  const extraData = useMemo(
    () => ({
      active,
    }),
    [active],
  );

  const renderItem = ({ item, index }: { item: unknown; index: number }) => {
    return props.renderItem(
      item,
      index,
      active && activeIndex.value === index,
      () => beginDrag(index),
    );
  };

  const draggingAnimatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value < 0) {
      return {
        opacity: 0,
        transform: [
          {
            translateY: 0,
          },
        ],
      };
    }
    return {
      opacity: 1,
      transform: [
        {
          translateY: panAbs.value - itemsSize / 2,
        },
      ],
    };
  }, [itemsSize]);

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
          // @ts-ignore
          ref={scrollview}
          data={data}
          renderItem={renderItem}
          CellRendererComponent={(rowProps) => (
            <ItemWrapper
              {...rowProps}
              activeIndex={activeIndex}
              insertIndex={insertIndex}
              height={itemsSize}
              active={active}
            />
          )}
          scrollEnabled={(props.scrollEnabled ?? true) && !active}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          extraData={extraData}
          renderScrollComponent={ScrollView}
        />
        {active && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                width: "100%",
                height: itemsSize,
              },
              draggingAnimatedStyle,
            ]}
          >
            {props.renderItem(
              data[Math.max(0, activeIndexState)],
              Math.max(0, activeIndexState),
              true,
              () => {},
            )}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

export default FlashDragList;
