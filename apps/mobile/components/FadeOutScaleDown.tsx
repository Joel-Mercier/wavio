import { type Link, useRouter } from "expo-router";
import React, { type ComponentProps, useEffect } from "react";
import Animated, { useSharedValue, withSpring } from "react-native-reanimated";
import { Pressable } from "@/components/ui/pressable";

interface FadeOutScaleDownProps {
  children?: React.ReactNode;
  className?: string;
  href?: ComponentProps<typeof Link>["href"];
  onPress?: ComponentProps<typeof Pressable>["onPress"];
  defaultOpacity?: number;
  disabled?: boolean;
  disabledOpacity?: number;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FadeOutScaleDown = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  FadeOutScaleDownProps
>(
  (
    {
      children,
      className,
      href,
      onPress,
      defaultOpacity = 1,
      disabled = false,
      disabledOpacity = 0.6,
      testID,
    },
    ref,
  ) => {
    const router = useRouter();
    const restingOpacity = disabled ? disabledOpacity : defaultOpacity;
    const opacity = useSharedValue(restingOpacity);
    const scale = useSharedValue(1);

    useEffect(() => {
      opacity.value = withSpring(restingOpacity, {
        duration: 100,
      });
    }, [restingOpacity, opacity]);

    const handlePressIn = () => {
      opacity.value = withSpring(0.5, {
        duration: 100,
      });
      scale.value = withSpring(0.95, {
        duration: 100,
      });
    };

    const handlePressOut = () => {
      opacity.value = withSpring(restingOpacity, {
        duration: 100,
      });
      scale.value = withSpring(1, {
        duration: 100,
      });
    };

    return (
      <AnimatedPressable
        ref={ref}
        testID={testID}
        onPress={href ? () => router.navigate(href) : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={className}
        style={{ opacity, transform: [{ scale }] }}
        disabled={disabled}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

export default FadeOutScaleDown;
