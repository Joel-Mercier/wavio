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
import { useConnectionType } from "@/hooks/useIsOnline";
import { getEffectiveMaxBitRate } from "@/services/network";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import { formatAudioQuality, getTranscodeInfo } from "@/utils/audioQuality";

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
  const streamingFormat = useApp((s) => s.streamingFormat);
  const maxBitRate = useApp((s) => s.maxBitRate);
  const cellularMaxBitRate = useApp((s) => s.cellularMaxBitRate);
  // Subscribe so the effective cap recomputes on WiFi↔cellular handoff.
  useConnectionType();
  const serverType = useAuthBase((s) => s.serverType);
  // Every remote backend transcodes server-side; only the on-device library
  // plays untouched files off disk, so it never shows a transcode.
  const isRemote = serverType !== "local";

  const label = formatAudioQuality(track);
  if (!label) return null;

  const transcode = isRemote
    ? getTranscodeInfo(track, {
        streamingFormat,
        effectiveMaxBitRate: getEffectiveMaxBitRate(
          maxBitRate,
          cellularMaxBitRate,
        ),
        // A raw-mode bitrate-forced transcode lands on AAC for Jellyfin (see
        // JELLYFIN_DEFAULT_TRANSCODE_CODEC in services/jellyfin/streaming.ts);
        // Subsonic keeps the source codec.
        rawTranscodeFormat: serverType === "jellyfin" ? "aac" : undefined,
      })
    : { active: false as const, fromLabel: null, toLabel: null };

  if (transcode.active && transcode.fromLabel && transcode.toLabel) {
    return (
      <View className="mb-4">
        <GradientSweepText
          from={transcode.fromLabel}
          to={transcode.toLabel}
          emerald={emerald500}
        />
      </View>
    );
  }

  return (
    <HStack className="items-center gap-x-2 mb-4">
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
