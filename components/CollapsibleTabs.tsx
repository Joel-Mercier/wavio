import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import PagerView, {
  type PagerViewOnPageSelectedEvent,
} from "react-native-pager-view";
import Animated, {
  type AnimatedRef,
  type SharedValue,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { Text } from "@/components/ui/text";
import { cn } from "@/utils/tailwind";

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

// biome-ignore lint/suspicious/noExplicitAny: AnimatedRef must accept FlashList, ScrollView, etc.
type AnyAnimatedRef = AnimatedRef<any>;

export interface CollapsibleSceneProps {
  scrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
  ref: AnyAnimatedRef;
  contentTopInset: number;
}

export interface CollapsibleTab {
  key: string;
  title: string;
  render: (props: CollapsibleSceneProps) => ReactNode;
}

interface Props {
  tabs: CollapsibleTab[];
  renderHeader: () => ReactNode;
  tabBarHeight?: number;
  minTopInset?: number;
  tabBarClassName?: string;
  initialIndex?: number;
  scrollY?: SharedValue<number>;
}

interface SceneProps {
  index: number;
  activeIndexSV: SharedValue<number>;
  scrollY: SharedValue<number>;
  registerRef: (index: number, ref: AnyAnimatedRef) => void;
  render: (p: CollapsibleSceneProps) => ReactNode;
  contentTopInset: number;
}

function Scene({
  index,
  activeIndexSV,
  scrollY,
  registerRef,
  render,
  contentTopInset,
}: SceneProps) {
  // biome-ignore lint/suspicious/noExplicitAny: scrollTo accepts any animated scrollable ref
  const ref = useAnimatedRef<any>();
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      if (activeIndexSV.value === index) {
        scrollY.value = event.contentOffset.y;
      }
    },
  });

  useEffect(() => {
    registerRef(index, ref);
  }, [index, ref, registerRef]);

  return (
    <View style={{ flex: 1 }} collapsable={false}>
      {render({ scrollHandler, ref, contentTopInset })}
    </View>
  );
}

export default function CollapsibleTabs({
  tabs,
  renderHeader,
  tabBarHeight = 48,
  minTopInset = 0,
  tabBarClassName,
  initialIndex = 0,
  scrollY: externalScrollY,
}: Props) {
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [headerHeightJs, setHeaderHeightJs] = useState(0);

  const internalScrollY = useSharedValue(0);
  const scrollY = externalScrollY ?? internalScrollY;
  const collapseDistance = useSharedValue(0);
  const activeIndexSV = useSharedValue(initialIndex);

  const refsMap = useRef<Map<number, AnyAnimatedRef>>(new Map());
  const registerRef = useCallback((i: number, r: AnyAnimatedRef) => {
    refsMap.current.set(i, r);
  }, []);

  const handleHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h !== headerHeightJs) {
        setHeaderHeightJs(h);
        collapseDistance.value = Math.max(h - minTopInset - tabBarHeight, 0);
      }
    },
    [collapseDistance, headerHeightJs, minTopInset, tabBarHeight],
  );

  const headerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -Math.min(
          Math.max(scrollY.value, 0),
          collapseDistance.value,
        ),
      },
    ],
  }));

  const handlePageSelected = (e: PagerViewOnPageSelectedEvent) => {
    const newIndex = e.nativeEvent.position;
    const prevY = scrollY.value;
    const D = collapseDistance.value;
    const targetY = Math.min(prevY, D);
    activeIndexSV.value = newIndex;
    setActiveIndex(newIndex);
    const newRef = refsMap.current.get(newIndex);
    if (!newRef) return;
    scheduleOnUI(() => {
      "worklet";
      scrollTo(newRef, 0, targetY, false);
      scrollY.value = targetY;
    });
  };

  const handleTabPress = (i: number) => {
    pagerRef.current?.setPage(i);
  };

  const contentTopInset = headerHeightJs;

  const sceneNodes = useMemo(
    () =>
      tabs.map((tab, i) => (
        <View key={tab.key} collapsable={false} style={{ flex: 1 }}>
          <Scene
            index={i}
            activeIndexSV={activeIndexSV}
            scrollY={scrollY}
            registerRef={registerRef}
            render={tab.render}
            contentTopInset={contentTopInset}
          />
        </View>
      )),
    [tabs, activeIndexSV, scrollY, registerRef, contentTopInset],
  );

  return (
    <View style={{ flex: 1 }}>
      <AnimatedPagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialIndex}
        onPageSelected={handlePageSelected}
      >
        {sceneNodes}
      </AnimatedPagerView>
      <Animated.View
        pointerEvents="box-none"
        onLayout={handleHeaderLayout}
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 5,
          },
          headerStyle,
        ]}
      >
        {renderHeader()}
        <View
          style={{ height: tabBarHeight }}
          className={cn("flex-row bg-black gap-x-4 px-6", tabBarClassName)}
        >
          {tabs.map((tab, i) => (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(i)}
              className="items-center justify-center"
            >
              <Text
                className={cn(
                  "text-white text-md",
                  activeIndex === i ? "font-bold" : "text-primary-100",
                )}
              >
                {tab.title}
              </Text>
              <View
                className={cn(
                  "h-0.5 w-full mt-1 rounded-full",
                  activeIndex === i ? "bg-emerald-500" : "bg-transparent",
                )}
              />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
