import MaskedView from "@react-native-masked-view/masked-view";
import { memo, useMemo } from "react";
import { View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { Uniwind } from "uniwind";
import BufferingSweep from "@/components/player/BufferingSweep";
import { Text } from "@/components/ui/text";
import { usePlaybackProgress } from "@/hooks/player";
import useScrubGesture from "@/hooks/useScrubGesture";
import { formatSeconds } from "@/utils/date";
import {
  BAR_WIDTH,
  buildPlaceholderPath,
  buildWaveformPath,
  WAVEFORM_HEIGHT,
} from "@/utils/waveformGeometry";

// The lane below the bars holding the elapsed / total labels. Folding them in
// here rather than adding a row underneath is what keeps the waveform roughly
// cost-neutral in height against the plain slider it replaces.
const LABEL_HEIGHT = 14;
const LABEL_FONT_SIZE = 11;

const TICK_WIDTH = 2;

/**
 * Isolated so the ~4 Hz progress tick re-renders two <Text> nodes instead of the
 * whole seekbar — the bars and their path string are expensive to diff and never
 * change while a track plays.
 */
const TimeLabels = memo(function TimeLabels({
  scrubSeconds,
}: {
  scrubSeconds: number | null;
}) {
  const { currentTime, duration } = usePlaybackProgress();
  return (
    <View
      pointerEvents="none"
      style={{
        height: LABEL_HEIGHT,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text
        className="text-primary-100"
        style={{ fontSize: LABEL_FONT_SIZE, lineHeight: LABEL_HEIGHT }}
      >
        {formatSeconds(scrubSeconds ?? currentTime)}
      </Text>
      <Text
        className="text-primary-100"
        style={{ fontSize: LABEL_FONT_SIZE, lineHeight: LABEL_HEIGHT }}
      >
        {formatSeconds(duration)}
      </Text>
    </View>
  );
});

type Props = {
  peaks: Uint8Array | null;
  progress: SharedValue<number>;
  disabled?: boolean;
  buffering?: boolean;
  /** Bookmark positions as 0..1 fractions. */
  ticks?: number[];
  settleEpsilon?: number;
  resetKey?: string | number;
  /** Preview position while dragging; null when playback drives the labels. */
  scrubSeconds: number | null;
  onScrub?: (frac: number) => void;
  onComplete?: (frac: number) => void;
};

export default function WaveformSeekbar({
  peaks,
  progress,
  disabled = false,
  buffering = false,
  ticks,
  settleEpsilon,
  resetKey,
  scrubSeconds,
  onScrub,
  onComplete,
}: Props) {
  const [primary400, white, emerald500] = Uniwind.getCSSVariable([
    "--color-primary-400",
    "--color-white",
    "--color-emerald-500",
  ]) as string[];

  const { gesture, onLayout, displayFrac, width } = useScrubGesture({
    progress,
    disabled,
    settleEpsilon,
    resetKey,
    onScrub,
    onComplete,
  });

  // Rounded, because a fractional layout width (rotation, the wide layout's flex
  // maths) would otherwise rebuild the path string on every layout pass.
  const pathWidth = Math.round(width);
  const path = useMemo(
    () =>
      peaks && peaks.length > 0
        ? buildWaveformPath(peaks, pathWidth)
        : buildPlaceholderPath(pathWidth),
    [peaks, pathWidth],
  );

  // The played layer is revealed by translating a clip window left and its
  // contents right by the same amount, so the visible region is exactly
  // [0, p*W]. Deliberately not an animated `width`: Reanimated classifies width
  // as a layout prop, forcing a shadow-tree commit and a Yoga pass every frame,
  // where a transform takes the direct UI-thread path.
  const clipStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, displayFrac.value));
    return { transform: [{ translateX: -(1 - p) * pathWidth }] };
  });
  const contentStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, displayFrac.value));
    return { transform: [{ translateX: (1 - p) * pathWidth }] };
  });

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View style={{ height: WAVEFORM_HEIGHT }} onLayout={onLayout}>
          {pathWidth > 0 && (
            <>
              <Svg width={pathWidth} height={WAVEFORM_HEIGHT}>
                <Path
                  d={path}
                  stroke={primary400}
                  strokeWidth={BAR_WIDTH}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
              <Animated.View
                // `overflow: hidden` normally blocks view flattening on its own;
                // collapsable={false} makes that explicit so the clip view can
                // never be optimised away on Android.
                collapsable={false}
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: pathWidth,
                    height: WAVEFORM_HEIGHT,
                    overflow: "hidden",
                  },
                  clipStyle,
                ]}
              >
                <Animated.View
                  style={[
                    { width: pathWidth, height: WAVEFORM_HEIGHT },
                    contentStyle,
                  ]}
                >
                  <Svg width={pathWidth} height={WAVEFORM_HEIGHT}>
                    <Path
                      d={path}
                      stroke={white}
                      strokeWidth={BAR_WIDTH}
                      strokeLinecap="round"
                      fill="none"
                    />
                  </Svg>
                </Animated.View>
              </Animated.View>
              {buffering && (
                // Masked to the bars themselves: swept across the plain box it
                // reads as a banner behind the waveform rather than the waveform
                // pulsing. The mask is the same path the bars are drawn from, so
                // the band only ever lights up bar pixels.
                <MaskedView
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: pathWidth,
                    height: WAVEFORM_HEIGHT,
                  }}
                  maskElement={
                    <Svg width={pathWidth} height={WAVEFORM_HEIGHT}>
                      <Path
                        d={path}
                        stroke="#fff"
                        strokeWidth={BAR_WIDTH}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </Svg>
                  }
                >
                  <BufferingSweep />
                </MaskedView>
              )}
              {ticks?.map((frac) => (
                <View
                  key={frac}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: Math.min(1, Math.max(0, frac)) * pathWidth,
                    top: 0,
                    width: TICK_WIDTH,
                    height: WAVEFORM_HEIGHT,
                    backgroundColor: emerald500,
                  }}
                />
              ))}
            </>
          )}
        </View>
      </GestureDetector>
      <TimeLabels scrubSeconds={scrubSeconds} />
    </View>
  );
}
