import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import MoveRight from "lucide-react-native/dist/esm/icons/move-right.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type LayoutChangeEvent,
  Text as RNText,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useConnectionType } from "@/hooks/useIsOnline";
import { trackTranscodeInfo } from "@/services/backend/streaming";
import useApp from "@/stores/app";
import useOffline from "@/stores/offline";
import type { QueueTrack } from "@/stores/queue";
import useTrackCache from "@/stores/trackCache";
import { cachedTranscodeInfo, formatAudioQuality } from "@/utils/audioQuality";

const LINE_CLASS = "text-white/70 text-xs font-medium tracking-wide";
const SWEEP_DURATION = 2800;
// Pause between sweeps so the pulse reads as a periodic accent, not a constant
// scroll.
const PULSE_DELAY = 2000;

// The "from → to" content, shared verbatim by the layout sizer and the mask so
// they measure and clip identically. `alignSelf: flex-start` keeps the row at
// its natural content width so onLayout measures the text, not the container.
function TranscodeContent({
  from,
  to,
  style,
  onLayout,
}: {
  from: string;
  to: string;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <HStack
      className="items-center"
      style={[{ alignSelf: "flex-start" }, style]}
      onLayout={onLayout}
    >
      <RNText className={LINE_CLASS} numberOfLines={1}>
        {from}
      </RNText>
      <MoveRight size={18} color="white" style={{ marginHorizontal: 8 }} />
      <RNText className={LINE_CLASS} numberOfLines={1}>
        {to}
      </RNText>
    </HStack>
  );
}

// An emerald highlight that slowly sweeps left→right across the text. The text
// is filled at a constant white/70 (matching the static line) via a base layer;
// a translucent emerald band translates over it under a text-shaped mask.
function GradientSweepText({
  from,
  to,
  emerald,
}: {
  from: string;
  to: string;
  emerald: string;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const translateX = useSharedValue(0);
  const bandWidth = Math.max(48, size.width * 0.6);

  useEffect(() => {
    if (size.width === 0) return;
    translateX.value = -bandWidth;
    translateX.value = withRepeat(
      withSequence(
        // Reset off the left edge, sweep across, then park off the right edge
        // (band invisible) for the delay before the next pulse.
        withTiming(-bandWidth, { duration: 0 }),
        withTiming(size.width, {
          duration: SWEEP_DURATION,
          easing: Easing.inOut(Easing.ease),
        }),
        withDelay(PULSE_DELAY, withTiming(size.width, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(translateX);
    };
  }, [translateX, size.width, bandWidth]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View>
      {/* Layout sizer: invisible once measured, MaskedView overlays it exactly. */}
      <TranscodeContent
        from={from}
        to={to}
        style={{ opacity: size.width > 0 ? 0 : 1 }}
        onLayout={(e) =>
          setSize({
            width: Math.ceil(e.nativeEvent.layout.width),
            height: Math.ceil(e.nativeEvent.layout.height),
          })
        }
      />
      {size.width > 0 && (
        <MaskedView
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: size.width,
            height: size.height,
          }}
          maskElement={<TranscodeContent from={from} to={to} />}
        >
          <Box
            className="bg-white/70"
            style={{ width: size.width, height: size.height }}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: bandWidth,
              },
              bandStyle,
            ]}
          >
            <LinearGradient
              colors={["transparent", emerald, "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </MaskedView>
      )}
    </View>
  );
}

export default function AudioQualityLine({
  track,
}: {
  track: QueueTrack | null;
}) {
  const { t } = useTranslation();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  // Subscriptions only: trackTranscodeInfo reads this state imperatively, but
  // the prediction must recompute when streaming settings change or on a
  // WiFi↔cellular handoff.
  useApp((s) => s.streamingFormat);
  useApp((s) => s.cellularStreamingFormat);
  useApp((s) => s.maxBitRate);
  useApp((s) => s.cellularMaxBitRate);
  useConnectionType();
  // Whether the *backend* can transcode, not whether the files are remote: a
  // network file share is remote and still serves the bytes untouched, so it can
  // no more show a transcode than the on-device library can. This is the same
  // set of backends services/player.ts calls `isServerTranscodeBackend`.
  const isRemote = useCapabilities().streamFormatSelection;
  // A downloaded track plays straight off disk (see resolveTrackUrl in
  // services/player.ts), so it's never transcoded regardless of streaming
  // settings — mirror that guard here so the label matches what's playing.
  const isDownloaded = useOffline((s) =>
    track ? track.id in s.downloadedTracks : false,
  );
  // A prefetched copy also plays off disk, but — unlike a download, saved in the
  // format the user picked — it was fetched under whatever format and cap the
  // network in force at the time imposed, so whether it is untranscoded is a
  // question only the file itself can answer. This is a readout of what the
  // engine is actually doing, not a badge of what the user owns, which is why it
  // knows about the cache when no other UI does.
  const cacheEntry = useTrackCache((s) =>
    track ? (s.entries[track.id] ?? null) : null,
  );

  const label = formatAudioQuality(track);
  if (!label) return null;

  const transcode =
    !isRemote || isDownloaded
      ? { active: false as const, fromLabel: null, toLabel: null }
      : cacheEntry
        ? cachedTranscodeInfo(track, cacheEntry)
        : trackTranscodeInfo(track);

  if (transcode.active && transcode.fromLabel && transcode.toLabel) {
    return (
      <View>
        <GradientSweepText
          from={transcode.fromLabel}
          to={transcode.toLabel}
          emerald={emerald500}
        />
      </View>
    );
  }

  return (
    <HStack className="items-center gap-x-2">
      <Text className={LINE_CLASS} numberOfLines={1}>
        {label}
      </Text>
      {isRemote && (
        <Text className="text-white/60 text-[10px] border border-white/25 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
          {t("app.player.original")}
        </Text>
      )}
    </HStack>
  );
}
