import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LyricsDialogLine, {
  LYRICS_LINE_HEIGHT,
} from "@/components/player/LyricsDialogLine";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { usePlaybackProgress } from "@/hooks/player";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { seekTo } from "@/services/player";
import { findCurrentLineIndex } from "@/utils/lyrics";

export default function LyricsDialog({
  isOpen,
  onClose,
  lyrics,
}: {
  isOpen: boolean;
  onClose: () => void;
  lyrics: StructuredLyrics | null;
}) {
  const { t } = useTranslation();
  const { currentTime } = usePlaybackProgress();
  const scrollRef = useRef<ScrollView>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const offsetMs = lyrics?.offset ?? 0;
  const positionMs = (currentTime ?? 0) * 1000 + offsetMs;
  const currentIndex = useMemo(
    () => (lyrics ? findCurrentLineIndex(lyrics.line, positionMs) : -1),
    [lyrics, positionMs],
  );

  useEffect(() => {
    if (!isOpen) return;
    if (currentIndex < 0) return;
    if (!containerHeight) return;
    const target = Math.max(
      0,
      currentIndex * LYRICS_LINE_HEIGHT -
        containerHeight / 2 +
        LYRICS_LINE_HEIGHT / 2,
    );
    scrollRef.current?.scrollTo({ y: target, animated: true });
  }, [currentIndex, containerHeight, isOpen]);

  return (
    <AlertDialog isOpen={isOpen} onClose={onClose} size="lg">
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.player.lyrics")}
          </Heading>
        </AlertDialogHeader>
        <Box
          className="mt-3 mb-4"
          style={{ maxHeight: 480 }}
          onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
        >
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 16 }}
          >
            {lyrics?.line.map((line, index) => {
              const { start } = line;
              return (
                <LyricsDialogLine
                  key={`${index}-${start ?? 0}`}
                  value={line.value}
                  isActive={index === currentIndex}
                  isPast={index < currentIndex}
                  onPress={
                    lyrics.synced && start != null
                      ? () => seekTo(Math.max(0, (start - offsetMs) / 1000))
                      : undefined
                  }
                />
              );
            })}
            {!lyrics && (
              <Text className="text-primary-100 text-center">
                {t("app.player.lyricsUnavailable")}
              </Text>
            )}
          </ScrollView>
        </Box>
        <AlertDialogFooter className="items-center justify-center">
          <FadeOutScaleDown
            onPress={onClose}
            className="items-center justify-center py-3 px-8 border border-white rounded-full"
          >
            <Text className="text-white font-bold text-lg">
              {t("app.shared.close")}
            </Text>
          </FadeOutScaleDown>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
