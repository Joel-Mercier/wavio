import { type Link, useRouter } from "expo-router";
import React, { type ComponentProps } from "react";
import Animated, { useSharedValue, withSpring } from "react-native-reanimated";
import { Pressable } from "@/components/ui/pressable";

interface FadeOutProps {
  children: React.ReactNode;
  className?: string;
  href?: ComponentProps<typeof Link>["href"];
  hitSlop?: ComponentProps<typeof Pressable>["hitSlop"];
  onPress?: ComponentProps<typeof Pressable>["onPress"];
  disabled?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FadeOut = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  FadeOutProps
>(({ children, className, href, hitSlop, onPress, disabled, testID }, ref) => {
  const router = useRouter();
  const opacity = useSharedValue(1);

  const handlePressIn = () => {
    opacity.value = withSpring(0.5, {
      duration: 100,
    });
  };

  const handlePressOut = () => {
    opacity.value = withSpring(1, {
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
      hitSlop={hitSlop}
      disabled={disabled}
      className={className}
      style={{ opacity }}
    >
      {children}
    </AnimatedPressable>
  );
});

export default FadeOut;
