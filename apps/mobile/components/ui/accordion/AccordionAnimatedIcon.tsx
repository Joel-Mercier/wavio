import type React from "react";
import { useEffect } from "react";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface AnimatedIconProps {
  isExpanded: boolean;
  children: React.ReactNode;
  duration?: number;
  rotation?: number; // Rotation angle in degrees (default 180)
  style?: any;
}

export const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  isExpanded,
  children,
  duration = 300,
  rotation = 180,
  style,
}) => {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withTiming(isExpanded ? 1 : 0, { duration });
  }, [isExpanded, duration]);

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(animatedValue.value, [0, 1], [0, rotation]);

    return {
      transform: [{ rotate: `${rotate}deg` }],
    };
  }, [rotation, animatedValue]);

  return (
    <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
  );
};
