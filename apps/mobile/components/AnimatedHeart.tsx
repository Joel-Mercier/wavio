import Heart from "lucide-react-native/dist/esm/icons/heart.mjs";
import { type ComponentProps, memo, useCallback, useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import { Pressable } from "@/components/ui/pressable";

type AnimatedHeartProps = {
  filled: boolean;
  onPress?: () => void;
  size?: number;
  filledColor?: string;
  emptyColor?: string;
  disabled?: boolean;
  className?: string;
  hitSlop?: ComponentProps<typeof Pressable>["hitSlop"];
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const AnimatedHeart = memo(function AnimatedHeart({
  filled,
  onPress,
  size = 24,
  filledColor: filledColorProp,
  emptyColor: emptyColorProp,
  disabled = false,
  className,
  hitSlop,
  testID,
}: AnimatedHeartProps) {
  const [emerald500, white] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-white",
  ]) as string[];
  const filledColor = filledColorProp ?? emerald500;
  const emptyColor = emptyColorProp ?? white;

  // Dim to a greyed resting state when disabled, mirroring FadeOutScaleDown.
  const restingOpacity = disabled ? 0.6 : 1;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(restingOpacity);

  useEffect(() => {
    opacity.value = withTiming(restingOpacity, { duration: 100 });
  }, [restingOpacity, opacity]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onPress?.();
    // Pop: a quick overshoot then settle, mirroring StarRating's spring feel.
    scale.value = withSequence(
      withTiming(1.25, { duration: 120 }),
      withSpring(1, { mass: 0.6, damping: 12, stiffness: 220 }),
    );
  }, [disabled, onPress, scale]);

  const handlePressIn = useCallback(() => {
    opacity.value = withTiming(0.5, { duration: 100 });
  }, [opacity]);

  const handlePressOut = useCallback(() => {
    opacity.value = withTiming(restingOpacity, { duration: 100 });
  }, [opacity, restingOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      testID={testID}
      hitSlop={hitSlop}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      className={className}
      style={animatedStyle}
    >
      <Heart
        size={size}
        color={filled ? filledColor : emptyColor}
        fill={filled ? filledColor : "transparent"}
      />
    </AnimatedPressable>
  );
});

export default AnimatedHeart;
