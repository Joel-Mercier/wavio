import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { themeConfig } from "@/config/theme";
import { Star } from "lucide-react-native";
import React, { memo, useCallback, useMemo, useState } from "react";
import type { ViewStyle } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

type StarRatingProps = {
  value: number;
  onChange?: (nextValue: number) => void;
  max?: number;
  size?: number;
  color?: string;
  emptyColor?: string;
  spacing?: number;
  disabled?: boolean;
  style?: ViewStyle;
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
}: {
  index: number;
  isActive: boolean;
  size: number;
  color: string;
  emptyColor: string;
  onPress: (index: number) => void;
  disabled?: boolean;
  spacing: number;
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
      style={[{ marginRight: index < 4 ? spacing : 0 }, animatedStyle]}
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
  color = themeConfig.theme.colors.emerald[500], // emerald-500
  emptyColor = themeConfig.theme.colors.gray[400], // gray-400
  spacing = 8,
  disabled = false,
  style,
}: StarRatingProps) {
  const [currentValue, setCurrentValue] = useState(value || 0);
  const clampedValue = Math.max(0, Math.min(max, Math.round(currentValue)));

  const stars = useMemo(() => Array.from({ length: max }, (_, i) => i), [max]);

  const handlePress = useCallback(
    (index: number) => {
      if (disabled) return;
      const next = index + 1; // integer only, no half steps

      // If clicking on the currently selected star, deselect it (set to 0)
      if (next === currentValue) {
        setCurrentValue(0);
        onChange?.(0);
      } else {
        setCurrentValue(next);
        onChange?.(next);
      }
    },
    [disabled, onChange, currentValue],
  );

  const panGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(!disabled)
      .onBegin((event) => {
        // compute initial value on touch begin
        const starWidth = size + spacing;
        const starIndex = Math.floor(event.x / starWidth);
        const newValue =
          starIndex < 0 ? 0 : Math.min(max, Math.max(0, starIndex + 1));
        scheduleOnRN(setCurrentValue, newValue);
      })
      .onUpdate((event) => {
        // live update UI while swiping (no onChange yet)
        const starWidth = size + spacing;
        const starIndex = Math.floor(event.x / starWidth);
        const newValue =
          starIndex < 0 ? 0 : Math.min(max, Math.max(0, starIndex + 1));
        scheduleOnRN(setCurrentValue, newValue);
      })
      .onEnd((event) => {
        // finalize and trigger onChange ONCE
        const starWidth = size + spacing;
        const starIndex = Math.floor(event.x / starWidth);
        const newValue =
          starIndex < 0 ? 0 : Math.min(max, Math.max(0, starIndex + 1));
        scheduleOnRN(setCurrentValue, newValue);
        if (onChange) scheduleOnRN(onChange, newValue);
      });
    return gesture;
  }, [disabled, size, spacing, max, onChange]);

  return (
    <GestureHandlerRootView>
      <GestureDetector gesture={panGesture}>
        <Animated.View>
          <Box style={[{ flexDirection: "row", alignItems: "center" }, style]}>
            {stars.map((i) => (
              <StarItem
                key={i}
                index={i}
                isActive={i < clampedValue}
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
