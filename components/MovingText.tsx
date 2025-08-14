import { useEffect } from "react";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface MovingTextProps {
  text: string;
  animationThreshold: number;
}

export default function MovingText({
  text,
  animationThreshold,
}: MovingTextProps) {
  const translateX = useSharedValue(0);
  const shouldAnimate = text.length > animationThreshold;
  const textWidth = text.length * 3;

  useEffect(() => {
    if (!shouldAnimate) {
      return;
    }
    translateX.value = withDelay(
      1000,
      withRepeat(
        withTiming(-textWidth, { duration: 5000, easing: Easing.linear }),
        -1,
        true,
      ),
    );
    return () => {
      cancelAnimation(translateX);
      translateX.value = 0;
    };
  }, [translateX, shouldAnimate, textWidth]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  return (
    <Animated.Text
      numberOfLines={1}
      className="text-white font-bold text-md"
      style={[animatedStyle, shouldAnimate && { paddingLeft: 10 }]}
    >
      {text}
    </Animated.Text>
  );
}
