import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { View } from "react-native";
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
import { usePlaybackProgress, usePlayingTrack } from "@/hooks/player";
import { useTrackBookmarks } from "@/hooks/useTrackBookmarks";
import { seekTo } from "@/services/player";
import { formatSeconds } from "@/utils/date";

export default function PlaybackSlider() {
  const { currentTime, duration } = usePlaybackProgress();
  // While a skipped-to track loads, the snapshot reports duration 0; a zero
  // maxValue makes the thumb percent NaN and the flex-centered fallback parks
  // the thumb mid-bar. Keep the range non-zero and pin the value to 0 instead.
  const hasDuration = duration > 0;
  const sliderValue = hasDuration ? Math.min(currentTime, duration) : 0;
  const track = usePlayingTrack();
  const bookmarks = useTrackBookmarks(track?.id);
  const [trackWidth, setTrackWidth] = useState(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  return (
    <VStack className="mb-6">
      <Box
        className="relative justify-center"
        style={{ height: 24 }}
        onLayout={handleLayout}
      >
        {/* Ticks render before the Slider so the opaque track and the thumb
            paint on top: the tick's middle is hidden by the bar while its ends
            poke out above and below it (and above/below the thumb). */}
        {duration > 0 &&
          trackWidth > 0 &&
          bookmarks.map((position) => {
            const left = Math.min(
              Math.max((position / duration) * trackWidth, 0),
              trackWidth,
            );
            return (
              <View
                key={position}
                pointerEvents="none"
                className="absolute w-0.5 bg-emerald-500"
                style={{ left, top: "50%", height: 22, marginTop: -11 }}
              />
            );
          })}
        <Slider
          defaultValue={0}
          value={sliderValue}
          step={1}
          minValue={0}
          maxValue={hasDuration ? duration : 1}
          size="md"
          orientation="horizontal"
          isDisabled={!hasDuration}
          isReversed={false}
          onChange={seekTo}
        >
          <SliderTrack
            className="bg-primary-400"
            hitSlop={{ top: 20, bottom: 20, left: 8, right: 8 }}
          >
            <SliderFilledTrack className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
          </SliderTrack>
          <SliderThumb
            className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white"
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          />
        </Slider>
      </Box>
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
