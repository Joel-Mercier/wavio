import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import LyricsLine, { LYRICS_LINE_HEIGHT } from "@/components/player/LyricsLine";
import { Box } from "@/components/ui/box";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
} from "@/hooks/player/playbackSnapshot";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { seekTo } from "@/services/player";
import useApp from "@/stores/app";
import {
  agentAlign,
  alignLayerToMain,
  findCurrentLineIndex,
  getAgentForLine,
  getCueLineForLine,
  isSyncedLyrics,
  type LyricAlign,
} from "@/utils/lyrics";
import { cn } from "@/utils/tailwind";

const ALIGN_TEXT: Record<LyricAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const MANUAL_SCROLL_GRACE_MS = 4000;

export type LyricLayers = {
  main: StructuredLyrics | null;
  translations: StructuredLyrics[];
  pronunciations: StructuredLyrics[];
};

export default function LyricsBody({
  lyrics,
  layers,
  isLoading = false,
}: {
  lyrics: StructuredLyrics | null;
  layers: LyricLayers;
  // Holds back the "no lyrics" message while a fetch is still in flight, so a
  // track change doesn't flash it before the new sheet arrives.
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const userScrollingUntilRef = useRef(0);
  const lineLayoutsRef = useRef<{ y: number; height: number }[]>([]);
  const offsetMs = lyrics?.offset ?? 0;
  const synced = isSyncedLyrics(lyrics);
  const karaokeEnabled = useApp((s) => s.karaokeEnabled);
  const translationLang = useApp((s) => s.lyricsTranslationLang);
  const showPronunciation = useApp((s) => s.lyricsShowPronunciation);

  const selectedTranslation = useMemo(
    () => layers.translations.find((l) => l.lang === translationLang) ?? null,
    [layers.translations, translationLang],
  );
  const selectedPronunciation = showPronunciation
    ? (layers.pronunciations[0] ?? null)
    : null;

  const translationByLine = useMemo(
    () => alignLayerToMain(lyrics?.line ?? [], selectedTranslation?.line),
    [lyrics, selectedTranslation],
  );
  const pronunciationByLine = useMemo(
    () => alignLayerToMain(lyrics?.line ?? [], selectedPronunciation?.line),
    [lyrics, selectedPronunciation],
  );

  useEffect(() => {
    lineLayoutsRef.current = [];
  }, [lyrics]);

  useEffect(() => {
    // Without timestamps there's no line to follow: keep the sheet static rather
    // than doing per-tick work to track an index that can't mean anything.
    if (!synced) {
      setCurrentIndex(-1);
      return;
    }
    const update = () => {
      const { currentTime } = getPlaybackSnapshot();
      const positionMs = (currentTime ?? 0) * 1000 + offsetMs;
      const next = lyrics ? findCurrentLineIndex(lyrics.line, positionMs) : -1;
      setCurrentIndex((prev) => (prev === next ? prev : next));
    };
    update();
    return subscribePlaybackProgress(update);
  }, [lyrics, offsetMs, synced]);

  useEffect(() => {
    if (currentIndex < 0) return;
    if (!containerHeight) return;
    if (Date.now() < userScrollingUntilRef.current) return;
    const layout = lineLayoutsRef.current[currentIndex];
    const target = layout
      ? Math.max(0, layout.y + layout.height / 2 - containerHeight / 2)
      : Math.max(
          0,
          currentIndex * LYRICS_LINE_HEIGHT -
            containerHeight / 2 +
            LYRICS_LINE_HEIGHT / 2,
        );
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [currentIndex, containerHeight]);

  return (
    <Box
      className="flex-1"
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      <MaskedView
        style={{ flex: 1 }}
        maskElement={
          <LinearGradient
            colors={["transparent", "#000", "#000", "transparent"]}
            locations={[0, 0.06, 0.94, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1 }}
          />
        }
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          onScrollBeginDrag={() => {
            userScrollingUntilRef.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
          }}
          contentContainerStyle={{ paddingVertical: 32, paddingHorizontal: 24 }}
        >
          {lyrics?.line.map((line, index) => {
            const { start } = line;
            const agent = getAgentForLine(lyrics, index);
            const align = agentAlign(agent?.role);
            const muted = agent?.role === "bg" || agent?.role === "group";
            const alignClass = ALIGN_TEXT[align];
            const pronunciationLines = pronunciationByLine[index] ?? [];
            const translationLines = translationByLine[index] ?? [];
            return (
              <Box
                key={`${index}-${start ?? 0}`}
                onLayout={(e) => {
                  lineLayoutsRef.current[index] = {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  };
                }}
              >
                {pronunciationLines.map((l, i) => (
                  <Text
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered lines
                    key={`p-${i}`}
                    className={cn("text-primary-200 text-sm mb-1", alignClass)}
                  >
                    {l.value}
                  </Text>
                ))}
                <LyricsLine
                  value={line.value}
                  isActive={index === currentIndex}
                  isPast={index < currentIndex}
                  align={align}
                  muted={muted}
                  plain={!synced}
                  cueLine={
                    karaokeEnabled && index === currentIndex
                      ? getCueLineForLine(lyrics, currentIndex)
                      : undefined
                  }
                  offsetMs={offsetMs}
                  onPress={
                    synced && start != null
                      ? () => seekTo(Math.max(0, (start - offsetMs) / 1000))
                      : undefined
                  }
                />
                {translationLines.map((l, i) => (
                  <Text
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable ordered lines
                    key={`t-${i}`}
                    className={cn("text-primary-200 text-sm mt-1", alignClass)}
                  >
                    {l.value}
                  </Text>
                ))}
              </Box>
            );
          })}
          {!lyrics &&
            (isLoading ? (
              <Box className="flex-1 items-center justify-center pt-12">
                <Spinner color="white" />
              </Box>
            ) : (
              <Box className="flex-1 items-center justify-center pt-12">
                <Text className="text-white text-center text-lg">
                  {t("app.player.lyricsUnavailable")}
                </Text>
              </Box>
            ))}
        </ScrollView>
      </MaskedView>
    </Box>
  );
}
