import CircleCheck from "lucide-react-native/icons/circle-check";
import { type ReactNode, useCallback, useRef } from "react";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { selectionHaptic } from "@/services/haptics";
import { cn } from "@/utils/tailwind";

// Same feel as the track rows' swipe action (components/tracks/TrackListItem.tsx).
const SWIPE_THRESHOLD = 96;
const MAX_TRANSLATE = 140;

interface SwipeToMarkPlayedProps {
  enabled: boolean;
  onMarkPlayed: () => void;
  className?: string;
  children: ReactNode;
}

// Dragging a podcast episode row to the right reveals an emerald panel and marks
// the episode played on release past the threshold. The row always springs
// back, so a recycled list cell never inherits an offset.
export default function SwipeToMarkPlayed({
  enabled,
  onMarkPlayed,
  className,
  children,
}: SwipeToMarkPlayedProps) {
  const [black, emerald500] = Uniwind.getCSSVariable([
    "--color-black",
    "--color-emerald-500",
  ]) as string[];

  const translateX = useSharedValue(0);
  const crossedThreshold = useSharedValue(false);

  // Keep the worklet-facing gesture stable: read the latest callback from a ref
  // instead of re-creating the pan gesture when it changes.
  const onMarkPlayedRef = useRef(onMarkPlayed);
  onMarkPlayedRef.current = onMarkPlayed;

  const triggerMarkPlayed = useCallback(() => {
    onMarkPlayedRef.current();
  }, []);

  const panGesture = usePanGesture({
    activeOffsetX: [-15, 15],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      const tx = Math.min(Math.max(e.translationX, 0), MAX_TRANSLATE);
      translateX.value = tx;
      const crossed = tx >= SWIPE_THRESHOLD;
      if (crossed && !crossedThreshold.value) {
        crossedThreshold.value = true;
        scheduleOnRN(selectionHaptic);
      } else if (!crossed && crossedThreshold.value) {
        crossedThreshold.value = false;
      }
    },
    onDeactivate: () => {
      crossedThreshold.value = false;
      if (translateX.value >= SWIPE_THRESHOLD) {
        scheduleOnRN(triggerMarkPlayed);
      }
      translateX.value = withTiming(0, { duration: 180 });
    },
  });

  const foregroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const revealStyle = useAnimatedStyle(() => ({
    width: Math.max(translateX.value, 0),
  }));

  if (!enabled) return <Box className={className}>{children}</Box>;

  return (
    <GestureDetector gesture={panGesture}>
      <Box className={cn("relative overflow-hidden", className)}>
        <Animated.View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: emerald500,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            },
            revealStyle,
          ]}
        >
          <CircleCheck size={24} color={black} />
        </Animated.View>
        <Animated.View style={foregroundStyle}>{children}</Animated.View>
      </Box>
    </GestureDetector>
  );
}
