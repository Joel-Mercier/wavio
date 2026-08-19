import Star from "lucide-react-native/dist/esm/icons/star.mjs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewStyle } from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";

type StarRatingProps = {
  value: number;
  // May return a promise: a rejection reverts the optimistic fill, so a failed
  // save never leaves the widget showing a rating the server didn't take.
  onChange?: (nextValue: number) => unknown;
  max?: number;
  size?: number;
  color?: string;
  emptyColor?: string;
  spacing?: number;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const StarItem = memo(function StarItem({
  index,
  isActive,
  size,
  color,
  emptyColor,
  onPress,
  disabled,
  spacing,
  isLast,
}: {
  index: number;
  isActive: boolean;
  size: number;
  color: string;
  emptyColor: string;
  onPress: (index: number) => void;
  disabled?: boolean;
  spacing: number;
  isLast: boolean;
}) {
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onPress(index);
    scale.value = 0.9;
    scale.value = withSpring(1, { mass: 0.6, damping: 14, stiffness: 220 });
  }, [disabled, index, onPress, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const starColor = isActive ? color : emptyColor;
  const starFill = isActive ? color : "transparent";

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Rate ${index + 1} star${index === 0 ? "" : "s"}`}
      hitSlop={8}
      disabled={disabled}
      onPress={handlePress}
      style={[{ marginRight: isLast ? 0 : spacing }, animatedStyle]}
    >
      <Star width={size} height={size} color={starColor} fill={starFill} />
    </AnimatedPressable>
  );
});

export const StarRating = memo(function StarRating({
  value,
  onChange,
  max = 5,
  size = 24,
  color: colorProp,
  emptyColor: emptyColorProp,
  spacing = 8,
  disabled = false,
  style,
  testID,
}: StarRatingProps) {
  const [emerald500, gray400] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-400",
  ]) as string[];
  const color = colorProp ?? emerald500;
  const emptyColor = emptyColorProp ?? gray400;
  const [currentValue, setCurrentValue] = useState(value || 0);
  const clampedValue = Math.max(0, Math.min(max, Math.round(currentValue)));
  // Last value known to be persisted, so a rejected onChange can roll back to
  // it. `value` alone can't do that: it keeps its identity when a save fails,
  // so the effect below never re-fires.
  const committedValue = useRef(value || 0);

  useEffect(() => {
    committedValue.current = value || 0;
    setCurrentValue(value || 0);
  }, [value]);

  const stars = useMemo(() => Array.from({ length: max }, (_, i) => i), [max]);

  const commit = useCallback(
    (next: number) => {
      const previous = committedValue.current;
      committedValue.current = next;
      setCurrentValue(next);
      const result = onChange?.(next);
      if (result instanceof Promise) {
        result.catch(() => {
          committedValue.current = previous;
          setCurrentValue(previous);
        });
      }
    },
    [onChange],
  );

  const handlePress = useCallback(
    (index: number) => {
      if (disabled) return;
      const next = index + 1; // integer only, no half steps

      // Tapping the currently selected star deselects it (set to 0)
      commit(next === currentValue ? 0 : next);
    },
    [disabled, commit, currentValue],
  );

  const panGesture = usePanGesture({
    enabled: !disabled,
    // Horizontal-only: the widget can sit inside a vertically dismissible screen
    // (the player), where an unconstrained pan would turn a swipe-to-close into
    // a rating write. Failing on vertical movement also means onDeactivate never
    // fires for those swipes.
    activeOffsetX: [-10, 10],
    failOffsetY: [-10, 10],
    // Intentionally no onBegin: setting the value on touch-down would make a tap
    // land on an already-selected star, tripping the tap-to-deselect logic in
    // StarItem.handlePress. Drag fills via onUpdate; taps go through the per-star
    // Pressable.
    onUpdate: (event) => {
      // live update UI while swiping (no onChange yet)
      const starWidth = size + spacing;
      const starIndex = Math.floor(event.x / starWidth);
      const newValue =
        starIndex < 0 ? 0 : Math.min(max, Math.max(0, starIndex + 1));
      scheduleOnRN(setCurrentValue, newValue);
    },
    onDeactivate: (event) => {
      // finalize and trigger onChange ONCE
      const starWidth = size + spacing;
      const starIndex = Math.floor(event.x / starWidth);
      const newValue =
        starIndex < 0 ? 0 : Math.min(max, Math.max(0, starIndex + 1));
      scheduleOnRN(commit, newValue);
    },
  });

  return (
    // Own gesture root so the drag keeps working inside an RN Modal (RatingModal),
    // which renders in a separate native hierarchy. The explicit style replaces
    // GestureHandlerRootView's default `flex: 1`, which would otherwise stretch
    // the widget wherever it sits next to other content.
    <GestureHandlerRootView style={{ alignSelf: "flex-start" }} testID={testID}>
      <GestureDetector gesture={panGesture}>
        <Animated.View>
          <Box style={[{ flexDirection: "row", alignItems: "center" }, style]}>
            {stars.map((i) => (
              <StarItem
                key={i}
                index={i}
                isActive={i < clampedValue}
                isLast={i === max - 1}
                size={size}
                color={color}
                emptyColor={emptyColor}
                spacing={spacing}
                onPress={handlePress}
                disabled={disabled}
              />
            ))}
          </Box>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
});

export default StarRating;
