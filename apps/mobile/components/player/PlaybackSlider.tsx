import { useRef, useState } from "react";
import GestureSlider from "@/components/GestureSlider";
import WaveformSeekbar from "@/components/player/WaveformSeekbar";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useIsBuffering,
  usePlaybackDuration,
  usePlaybackProgress,
  usePlaybackProgressValue,
  usePlayingTrack,
} from "@/hooks/player";
import { useTrackBookmarks } from "@/hooks/useTrackBookmarks";
import { useWaveform } from "@/hooks/useWaveform";
import { isAudioWaveformAvailable } from "@/modules/audio-waveform";
import { seekTo } from "@/services/player";
import useApp from "@/stores/app";
import { formatSeconds } from "@/utils/date";
import { cn } from "@/utils/tailwind";

// Hold a released seek position until live playback lands within this many
// seconds of it (converted to a fraction for the slider's settle logic).
const SEEK_SETTLE_THRESHOLD = 1.5;

export default function PlaybackSlider({
  // Opt-in per screen: the waveform earns its extra height on the player, but
  // the lyrics view would rather spend that room on lyric lines.
  allowWaveform = false,
}: {
  allowWaveform?: boolean;
}) {
  const waveformEnabled = useApp((s) => s.waveformSeekbarEnabled);
  const showWaveform =
    allowWaveform && waveformEnabled && isAudioWaveformAvailable();
  return showWaveform ? <WaveformVariant /> : <SliderVariant />;
}

// Common wiring: bookmark ticks, the settle epsilon and the scrub preview all
// derive from duration, which only changes on a track change — never on a tick.
function useSeekWiring() {
  const duration = usePlaybackDuration();
  const hasDuration = duration > 0;
  const track = usePlayingTrack();
  const bookmarks = useTrackBookmarks(track?.id);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);

  return {
    track,
    duration,
    hasDuration,
    scrubSeconds,
    ticks:
      hasDuration && bookmarks.length
        ? bookmarks.map((pos) => pos / duration)
        : undefined,
    settleEpsilon: hasDuration ? SEEK_SETTLE_THRESHOLD / duration : undefined,
    onScrub: (frac: number) => setScrubSeconds(frac * durationRef.current),
    onComplete: (frac: number) => {
      setScrubSeconds(null);
      seekTo(frac * durationRef.current);
    },
  };
}

function WaveformVariant() {
  const isWideLayout = useApp((s) => s.isWideLayout);
  const liveProgress = usePlaybackProgressValue();
  const buffering = useIsBuffering();
  const wiring = useSeekWiring();
  // Keyed on the track id, so peaks arriving for a track the user already
  // skipped past can't overwrite the current one's bars.
  const waveform = useWaveform(wiring.track ?? null);

  return (
    <VStack className={cn(isWideLayout ? "mb-2" : "mb-4")}>
      <WaveformSeekbar
        peaks={waveform.peaks}
        progress={liveProgress}
        disabled={!wiring.hasDuration}
        buffering={buffering}
        ticks={wiring.ticks}
        settleEpsilon={wiring.settleEpsilon}
        resetKey={wiring.track?.id}
        scrubSeconds={wiring.scrubSeconds}
        onScrub={wiring.onScrub}
        onComplete={wiring.onComplete}
      />
      {/* Collapses to nothing in portrait; in the wide layout it grows to keep
          the transport controls at the bottom of the centred column, exactly as
          it does for the plain slider below. */}
      <Box className="flex-1 h-[50px]" />
    </VStack>
  );
}

function SliderVariant() {
  const { currentTime } = usePlaybackProgress();
  const isWideLayout = useApp((s) => s.isWideLayout);
  // Live position as a 0..1 shared value, updated on the UI thread (~4 Hz) with
  // no React re-render, so a progress tick can never fight the drag gesture.
  const liveProgress = usePlaybackProgressValue();
  const buffering = useIsBuffering();
  const wiring = useSeekWiring();

  return (
    <VStack className={cn(isWideLayout ? "mb-2" : "mb-6")}>
      <GestureSlider
        progress={liveProgress}
        disabled={!wiring.hasDuration}
        buffering={buffering}
        ticks={wiring.ticks}
        settleEpsilon={wiring.settleEpsilon}
        resetKey={wiring.track?.id}
        onScrub={wiring.onScrub}
        onComplete={wiring.onComplete}
      />
      <Box className="flex-1 h-[50px]" />
      <HStack className="mt-2 items-center justify-between">
        <Text className="text-primary-100 text-sm">
          {formatSeconds(wiring.scrubSeconds ?? currentTime)}
        </Text>
        <Text className="text-primary-100 text-sm">
          {formatSeconds(wiring.duration)}
        </Text>
      </HStack>
    </VStack>
  );
}
