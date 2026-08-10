import { type Link, useRouter } from "expo-router";
import React, {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import Animated, { useSharedValue, withSpring } from "react-native-reanimated";
import { Pressable } from "@/components/ui/pressable";

interface FadeOutScaleDownProps {
  children?: React.ReactNode;
  className?: string;
  href?: ComponentProps<typeof Link>["href"];
  onPress?: ComponentProps<typeof Pressable>["onPress"];
  onLongPress?: ComponentProps<typeof Pressable>["onLongPress"];
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
      onLongPress,
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

    const handlePressIn = useCallback(() => {
      opacity.value = withSpring(0.5, {
        duration: 100,
      });
      scale.value = withSpring(0.95, {
        duration: 100,
      });
    }, [opacity, scale]);

    const handlePressOut = useCallback(() => {
      opacity.value = withSpring(restingOpacity, {
        duration: 100,
      });
      scale.value = withSpring(1, {
        duration: 100,
      });
    }, [opacity, scale, restingOpacity]);

    const handlePress = useCallback(
      (event: Parameters<NonNullable<typeof onPress>>[0]) => {
        if (href) {
          router.navigate(href);
          return;
        }
        onPress?.(event);
      },
      [href, router, onPress],
    );

    // Shared values are stable refs, so this object only ever needs building
    // once. Rebuilding it per render made every list row hand Reanimated a new
    // style to reprocess on any parent re-render.
    const animatedStyle = useMemo(
      () => ({ opacity, transform: [{ scale }] }),
      [opacity, scale],
    );

    return (
      <AnimatedPressable
        ref={ref}
        testID={testID}
        onPress={handlePress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={className}
        style={animatedStyle}
        disabled={disabled}
      >
        {children}
      </AnimatedPressable>
    );
  },
);

export default FadeOutScaleDown;
