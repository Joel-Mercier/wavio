import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

interface MovingTextProps {
  text: string;
  className?: string;
  initialDelay?: number;
  endDelay?: number;
  pixelsPerSecond?: number;
  gap?: number;
}

export default function MovingText({
  text,
  className = "text-white font-bold text-md",
  initialDelay = 2000,
  endDelay = 1500,
  pixelsPerSecond = 40,
  gap = 24,
}: MovingTextProps) {
  const translateX = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const overflow = Math.max(0, textWidth - containerWidth);
  const shouldAnimate = overflow > 0 && containerWidth > 0;
  const distance = overflow + gap;

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(translateX);
      translateX.value = 0;
      return;
    }
    const duration = Math.max(1000, (distance / pixelsPerSecond) * 1000);
    translateX.value = 0;
    translateX.value = withRepeat(
      withSequence(
        withDelay(
          initialDelay,
          withTiming(-distance, { duration, easing: Easing.linear }),
        ),
        withDelay(
          endDelay,
          withTiming(0, {
            duration: Math.max(400, duration / 2),
            easing: Easing.out(Easing.cubic),
          }),
        ),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(translateX);
      translateX.value = 0;
    };
  }, [
    translateX,
    shouldAnimate,
    distance,
    initialDelay,
    endDelay,
    pixelsPerSecond,
  ]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={{ width: "100%", overflow: "hidden" }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Base text — defines the row height and is shown when text fits. Hidden while animating. */}
      <Text
        numberOfLines={1}
        className={className}
        style={shouldAnimate ? { opacity: 0 } : undefined}
      >
        {text}
      </Text>
      {/* Off-screen natural-width measurer. The wide wrapper lets the Text expand
          to its natural single-line width without being clipped by the parent. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 10000,
          opacity: 0,
        }}
      >
        <Text
          className={className}
          style={{ alignSelf: "flex-start" }}
          onLayout={(e) => setTextWidth(Math.ceil(e.nativeEvent.layout.width))}
        >
          {text}
        </Text>
      </View>
      {shouldAnimate && (
        <Animated.Text
          numberOfLines={1}
          ellipsizeMode="clip"
          className={className}
          style={[
            animatedStyle,
            {
              position: "absolute",
              left: 0,
              top: 0,
              width: textWidth,
            },
          ]}
        >
          {text}
        </Animated.Text>
      )}
    </View>
  );
}
