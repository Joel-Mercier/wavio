import { Box } from "@/components/ui/box";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

interface SliderProps {
  trackClassName?: string;
  thumbClassName?: string;
}

const INITIAL_BOX_SIZE = 50;
const SLIDER_WIDTH = 300;

const SliderThumb = Animated.createAnimatedComponent(Box);

export default function Slider({
  trackClassName,
  thumbClassName,
}: SliderProps) {
  const offset = useSharedValue(0);
  const MAX_VALUE = SLIDER_WIDTH - INITIAL_BOX_SIZE;

  const pan = Gesture.Pan().onChange((event) => {
    offset.value =
      Math.abs(offset.value) <= MAX_VALUE
        ? offset.value + event.changeX <= 0
          ? 0
          : offset.value + event.changeX >= MAX_VALUE
            ? MAX_VALUE
            : offset.value + event.changeX
        : offset.value;
  });

  const sliderStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: offset.value }],
    };
  });

  return (
    <GestureHandlerRootView>
      <Box className={trackClassName}>
        <GestureDetector gesture={pan}>
          <SliderThumb className={thumbClassName} style={[sliderStyle]} />
        </GestureDetector>
      </Box>
    </GestureHandlerRootView>
  );
}
