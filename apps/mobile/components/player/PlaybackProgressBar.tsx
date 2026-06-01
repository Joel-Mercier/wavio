import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Box } from "@/components/ui/box";
import { usePlaybackProgressValue } from "@/hooks/player";

export default function PlaybackProgressBar() {
  // Driven on the UI thread from a shared value. This bar lives in the always-on
  // FloatingPlayer, so re-rendering it on every ~4 Hz progress tick would commit
  // a layout on the JS thread app-wide; the animated width avoids React renders.
  const progress = usePlaybackProgressValue();
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  return (
    <Box
      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-100"
      style={{ zIndex: 3 }}
    >
      <Animated.View className="h-full bg-white" style={fillStyle} />
    </Box>
  );
}
