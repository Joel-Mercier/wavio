import { memo, useEffect, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import { selectionHaptic } from "@/services/haptics";

const SPRING = { mass: 0.5, damping: 12, stiffness: 220 };

interface AlphabetIndexBarProps {
  letters: string[];
  // Called (on the JS thread) whenever the touched letter changes during a drag.
  onSelect: (index: number) => void;
  // Section index currently at the top of the list; highlighted when not dragging.
  currentIndex?: number;
  // Keep the bar clear of the header / tab bar.
  insetTop?: number;
  insetBottom?: number;
}

function LetterItem({
  letter,
  index,
  dragIdx,
  scrollIdx,
  activeColor,
  inactiveColor,
}: {
  letter: string;
  index: number;
  dragIdx: SharedValue<number>;
  scrollIdx: SharedValue<number>;
  activeColor: string;
  inactiveColor: string;
}) {
  const style = useAnimatedStyle(() => {
    const highlighted = dragIdx.value >= 0 ? dragIdx.value : scrollIdx.value;
    const isActive = highlighted === index;
    return {
      color: isActive ? activeColor : inactiveColor,
      transform: [{ scale: withSpring(isActive ? 1.6 : 1, SPRING) }],
    };
  });
  return (
    <View className="flex-1 min-h-[12px] items-center justify-center self-stretch">
      <Animated.Text
        className="text-[11px] font-bold text-center"
        style={style}
      >
        {letter}
      </Animated.Text>
    </View>
  );
}

function AlphabetIndexBar({
  letters,
  onSelect,
  currentIndex,
  insetTop = 0,
  insetBottom = 0,
}: AlphabetIndexBarProps) {
  const [emerald500, primary100] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-primary-100",
  ]) as string[];
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const barHeight = useSharedValue(0);
  const dragIdx = useSharedValue(-1);
  const scrollIdx = useSharedValue(currentIndex ?? -1);
  const dragging = useSharedValue(0);

  // Mirror the scroll-driven section index into a shared value so the letter
  // styles (and the drag fallback) can read it on the UI thread.
  useEffect(() => {
    scrollIdx.value = currentIndex ?? -1;
  }, [currentIndex, scrollIdx]);

  const handleChange = (index: number) => {
    // Only pulse when the touched letter actually changes (handleChange is
    // already only called on a letter transition), matching a native picker.
    selectionHaptic();
    setActiveLetter(letters[index] ?? null);
    onSelect(index);
  };
  const handleEnd = () => {
    setActiveLetter(null);
  };

  const n = letters.length;
  // The letters only occupy the track between the top/bottom insets, but the
  // measured bar height spans the full padded view. Map the touch onto that
  // track so the finger, the highlighted letter and the selection all agree
  // (and the last letters stay reachable).
  const idxFromY = (y: number, h: number) => {
    "worklet";
    const track = h - insetTop - insetBottom;
    if (track <= 0) return 0;
    const raw = Math.floor(((y - insetTop) / track) * n);
    return Math.min(n - 1, Math.max(0, raw));
  };
  const gesture = usePanGesture({
    minDistance: 0,
    hitSlop: { left: 16, right: 8 },
    onBegin: (e) => {
      const h = barHeight.value;
      if (h <= 0 || n === 0) return;
      const idx = idxFromY(e.y, h);
      dragging.value = 1;
      dragIdx.value = idx;
      scheduleOnRN(handleChange, idx);
    },
    onUpdate: (e) => {
      const h = barHeight.value;
      if (h <= 0 || n === 0) return;
      const idx = idxFromY(e.y, h);
      if (idx !== dragIdx.value) {
        dragIdx.value = idx;
        scheduleOnRN(handleChange, idx);
      }
    },
    onFinalize: () => {
      dragging.value = 0;
      dragIdx.value = -1;
      scheduleOnRN(handleEnd);
    },
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    barHeight.value = e.nativeEvent.layout.height;
  };

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: withTiming(dragging.value, { duration: 120 }),
    transform: [
      { scale: withTiming(dragging.value ? 1 : 0.8, { duration: 120 }) },
    ],
  }));

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        className="absolute self-center top-[40%] w-[88px] h-[88px] rounded-full border-2 border-emerald-500 bg-primary-900 items-center justify-center"
        style={bubbleStyle}
      >
        <Animated.Text className="text-[44px] font-extrabold uppercase text-white">
          {activeLetter}
        </Animated.Text>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <View
          onLayout={handleLayout}
          pointerEvents="auto"
          className="absolute right-0.5 top-0 bottom-0 w-[22px] items-center justify-center"
          style={{ paddingTop: insetTop, paddingBottom: insetBottom }}
        >
          {letters.map((letter, index) => (
            <LetterItem
              key={letter}
              letter={letter}
              index={index}
              dragIdx={dragIdx}
              scrollIdx={scrollIdx}
              activeColor={emerald500}
              inactiveColor={primary100}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

export default memo(AlphabetIndexBar);
