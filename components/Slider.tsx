import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { useCallback, useEffect, useState } from "react";
import { type GestureResponderEvent, View } from "react-native";
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
import { runOnJS, scheduleOnRN } from "react-native-worklets";

interface SliderProps {
  value?: number;
  onValueChange?: (value: number) => void;
  onSlidingStart?: () => void;
  onSlidingComplete?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  trackClassName?: string;
  filledTrackClassName?: string;
  thumbClassName?: string;
  width?: number;
  height?: number;
  thumbSize?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const DEFAULT_THUMB_SIZE = 20;
const DEFAULT_TRACK_HEIGHT = 4;

const SliderThumb = Animated.createAnimatedComponent(Box);
const SliderFilledTrack = Animated.createAnimatedComponent(Box);

export default function Slider({
  value = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  trackClassName = "bg-gray-300 rounded-full",
  filledTrackClassName = "bg-blue-500 rounded-full",
  thumbClassName = "bg-white rounded-full shadow-lg border-2 border-blue-500",
  width,
  height = DEFAULT_TRACK_HEIGHT,
  thumbSize = DEFAULT_THUMB_SIZE,
  accessibilityLabel,
  accessibilityHint,
}: SliderProps) {
  const [trackWidth, setTrackWidth] = useState(width || 300);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate the maximum thumb position (track width - thumb size)
  const maxThumbPosition = trackWidth - thumbSize;

  // Convert value to thumb position
  const valueToPosition = useCallback(
    (val: number) => {
      const normalizedValue = (val - min) / (max - min);
      return normalizedValue * maxThumbPosition;
    },
    [min, max, maxThumbPosition],
  );

  // Convert thumb position to value
  const positionToValue = useCallback(
    (position: number) => {
      const normalizedPosition = position / maxThumbPosition;
      const rawValue = min + normalizedPosition * (max - min);
      // Apply step rounding
      const steppedValue = Math.round(rawValue / step) * step;
      return Math.max(min, Math.min(max, steppedValue));
    },
    [min, max, step, maxThumbPosition],
  );

  const thumbPosition = useSharedValue(valueToPosition(value));
  const isSliding = useSharedValue(false);

  // Update thumb position when value prop changes (but not during dragging)
  useEffect(() => {
    if (!isDragging) {
      thumbPosition.value = withSpring(valueToPosition(value), {
        damping: 15,
        stiffness: 150,
      });
    }
  }, [value, valueToPosition, thumbPosition, isDragging]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isSliding.value = true;
      runOnJS(setIsDragging)(true);
      // if (onSlidingStart) {
      //   runOnJS(onSlidingStart);
      // }
    })
    .onUpdate((event) => {
      const newPosition = Math.max(
        0,
        Math.min(maxThumbPosition, event.absoluteX - thumbSize / 2),
      );
      thumbPosition.value = newPosition;

      const newValue = positionToValue(newPosition);
      // if (onValueChange) {
      //   runOnJS(onValueChange)(newValue);
      // }
    })
    .onEnd(() => {
      isSliding.value = false;
      runOnJS(setIsDragging)(false);
      const finalValue = positionToValue(thumbPosition.value);
      // if (onSlidingComplete) {
      //   runOnJS(onSlidingComplete)(finalValue);
      // }
    });

  const handleTrackPress = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) return;

      const { locationX } = event.nativeEvent;
      const newPosition = Math.max(
        0,
        Math.min(maxThumbPosition, locationX - thumbSize / 2),
      );
      thumbPosition.value = withSpring(newPosition, {
        damping: 15,
        stiffness: 150,
      });

      const newValue = positionToValue(newPosition);
      onValueChange?.(newValue);
      onSlidingComplete?.(newValue);
    },
    [
      disabled,
      maxThumbPosition,
      thumbSize,
      thumbPosition,
      positionToValue,
      onValueChange,
      onSlidingComplete,
    ],
  );

  const thumbStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: thumbPosition.value }],
    };
  });

  const filledTrackStyle = useAnimatedStyle(() => {
    const width = (thumbPosition.value / maxThumbPosition) * 100;
    return {
      width: `${Math.max(0, Math.min(100, width))}%`,
    };
  });

  return (
    <GestureHandlerRootView className="flex-1">
      <View
        style={{ width: width || "100%" }}
        onLayout={(event) => {
          const { width: layoutWidth } = event.nativeEvent.layout;
          setTrackWidth(layoutWidth);
        }}
      >
        <Pressable
          onPress={handleTrackPress}
          disabled={disabled}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityValue={{
            min,
            max,
            now: value,
          }}
          className="relative justify-center"
          style={{ height }}
        >
          {/* Track */}
          <Box
            className={trackClassName}
            style={{
              width: "100%",
              height,
              position: "absolute",
            }}
          />

          {/* Filled Track */}
          <SliderFilledTrack
            className={filledTrackClassName}
            style={[
              filledTrackStyle,
              {
                height,
                position: "absolute",
              },
            ]}
          />

          {/* Thumb */}
          <GestureDetector gesture={pan}>
            <SliderThumb
              className={thumbClassName}
              style={[
                thumbStyle,
                {
                  width: thumbSize,
                  height: thumbSize,
                  position: "absolute",
                  top: (height - thumbSize) / 2,
                },
              ]}
            />
          </GestureDetector>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}
