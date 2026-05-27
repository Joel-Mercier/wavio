import { Box } from "@/components/ui/box";
import { usePlaybackProgress } from "@/hooks/player";

export default function PlaybackProgressBar() {
  const { currentTime, duration } = usePlaybackProgress();
  const progress =
    duration && duration > 0
      ? Math.min(1, Math.max(0, (currentTime ?? 0) / duration))
      : 0;
  return (
    <Box
      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-100"
      style={{ zIndex: 3 }}
    >
      <Box
        className="h-full bg-white"
        style={{ width: `${progress * 100}%` }}
      />
    </Box>
  );
}
