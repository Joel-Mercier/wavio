import { Pressable } from "@/components/ui/pressable";
import { type Link, useRouter } from "expo-router";
import React, { type ComponentProps } from "react";
import Animated, { useSharedValue, withSpring } from "react-native-reanimated";

interface FadeOutScaleDownProps {
  children?: React.ReactNode;
  className?: string;
  href?: ComponentProps<typeof Link>["href"];
  onPress?: ComponentProps<typeof Pressable>["onPress"];
  defaultOpacity?: number;
  disabled?: boolean;
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
    },
    ref,
  ) => {
    const router = useRouter();
    const opacity = useSharedValue(defaultOpacity);
    const scale = useSharedValue(1);

    const handlePressIn = () => {
      opacity.value = withSpring(0.5, {
        duration: 100,
      });
      scale.value = withSpring(0.95, {
        duration: 100,
      });
    };

    const handlePressOut = () => {
      opacity.value = withSpring(1, {
        duration: 100,
      });
      scale.value = withSpring(1, {
        duration: 100,
      });
    };

    return (
      <AnimatedPressable
        ref={ref}
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
