import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import {
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
} from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlaybackProgress } from "@/hooks/player";
import { seekTo } from "@/services/player";

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export default function PlaybackSlider() {
  const { currentTime, duration } = usePlaybackProgress();
  return (
    <VStack className="mb-6">
      <Slider
        defaultValue={0}
        value={currentTime}
        step={1}
        minValue={0}
        maxValue={duration}
        size="md"
        orientation="horizontal"
        isDisabled={false}
        isReversed={false}
        onChange={seekTo}
      >
        <SliderTrack className="bg-primary-400">
          <SliderFilledTrack className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
        </SliderTrack>
        <SliderThumb className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
      </Slider>
      <Box className="flex-1 h-[50px]" />
      <HStack className="mt-2 items-center justify-between">
        <Text className="text-primary-100 text-sm">
          {formatSeconds(currentTime)}
        </Text>
        <Text className="text-primary-100 text-sm">
          {formatSeconds(duration)}
        </Text>
      </HStack>
    </VStack>
  );
}
