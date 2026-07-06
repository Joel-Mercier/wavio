import { useRef, useState } from "react";
import GestureSlider from "@/components/GestureSlider";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useIsBuffering,
  usePlaybackProgress,
  usePlaybackProgressValue,
  usePlayingTrack,
} from "@/hooks/player";
import { useTrackBookmarks } from "@/hooks/useTrackBookmarks";
import { seekTo } from "@/services/player";
import useApp from "@/stores/app";
import { formatSeconds } from "@/utils/date";
import { cn } from "@/utils/tailwind";

// Hold a released seek position until live playback lands within this many
// seconds of it (converted to a fraction for the slider's settle logic).
const SEEK_SETTLE_THRESHOLD = 1.5;

export default function PlaybackSlider() {
  const { currentTime, duration } = usePlaybackProgress();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const hasDuration = duration > 0;
  // Live position as a 0..1 shared value, updated on the UI thread (~4 Hz) with
  // no React re-render, so a progress tick can never fight the drag gesture.
  const liveProgress = usePlaybackProgressValue();
  const buffering = useIsBuffering();
  const track = usePlayingTrack();
  const bookmarks = useTrackBookmarks(track?.id);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);

  const ticks =
    hasDuration && bookmarks.length
      ? bookmarks.map((pos) => pos / duration)
      : undefined;

  const handleScrub = (frac: number) => {
    setScrubSeconds(frac * durationRef.current);
  };

  const handleComplete = (frac: number) => {
    setScrubSeconds(null);
    seekTo(frac * durationRef.current);
  };

  return (
    <VStack className={cn(isWideLayout ? "mb-2" : "mb-6")}>
      <GestureSlider
        progress={liveProgress}
        disabled={!hasDuration}
        buffering={buffering}
        ticks={ticks}
        settleEpsilon={
          hasDuration ? SEEK_SETTLE_THRESHOLD / duration : undefined
        }
        resetKey={track?.id}
        onScrub={handleScrub}
        onComplete={handleComplete}
      />
      <Box className="flex-1 h-[50px]" />
      <HStack className="mt-2 items-center justify-between">
        <Text className="text-primary-100 text-sm">
          {formatSeconds(scrubSeconds ?? currentTime)}
        </Text>
        <Text className="text-primary-100 text-sm">
          {formatSeconds(duration)}
        </Text>
      </HStack>
    </VStack>
  );
}
