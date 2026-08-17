import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import Mic2 from "lucide-react-native/dist/esm/icons/mic-vocal.mjs";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useLrclibSearch } from "@/hooks/lrclib/useLrclibSearch";
import { useBackendLyrics } from "@/hooks/player";
import type { LrclibRecord } from "@/services/lrclib/types";
import useLrclibPicks from "@/stores/lrclibPicks";
import type { QueueTrack } from "@/stores/queue";
import { formatSeconds } from "@/utils/date";
import { isSyncedLyrics } from "@/utils/lyrics";

// Lets the user override which lyrics a track uses, when the automatic match
// lands on a cover, a live take or a mistimed sync. The server's own lyrics are
// listed first when it returned any: they are what the automatic choice
// resolves to, and a pick takes precedence over them (see
// hooks/player/useSyncedLyrics).
export default function LrclibPickerSheet({
  sheetRef,
  track,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  track: QueueTrack | null;
}) {
  const [emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  // The search fans out to LRCLIB, so it must not run until the sheet is
  // actually on screen — opening the player must stay free of it.
  const [isOpen, setIsOpen] = useState(false);
  const pick = useLrclibPicks((state) =>
    track?.id ? state.picks[track.id] : undefined,
  );
  const setPick = useLrclibPicks((state) => state.setPick);
  const clearPick = useLrclibPicks((state) => state.clearPick);
  // Shares its query with the player/lyrics screen above, so listing the
  // server's lyrics here costs no extra request.
  const { lyrics: serverLyrics } = useBackendLyrics(track);
  const { results, isLoading, isError } = useLrclibSearch({
    trackName: track?.title,
    artistName: track?.artist,
    duration: track?.duration,
    enabled: isOpen,
  });

  const handleAutomaticPress = () => {
    if (track?.id) clearPick(track.id);
    sheetRef.current?.dismiss();
  };

  const handleResultPress = (record: LrclibRecord) => {
    if (track?.id) setPick(track.id, record);
    sheetRef.current?.dismiss();
  };

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      onChange={(index) => setIsOpen(index >= 0)}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <Mic2 size={24} color={gray200} />
            <Heading className="ml-4 text-white font-normal" size="lg">
              {t("app.player.lyricsPicker")}
            </Heading>
          </HStack>
          <VStack className="gap-y-6">
            {/* With server lyrics in hand the automatic choice always resolves
                to them, so it is shown as that entry rather than as a second,
                identical "automatic" row. */}
            {serverLyrics ? (
              <FadeOutScaleDown onPress={handleAutomaticPress}>
                <HStack className="items-center justify-between gap-x-4">
                  <VStack className="flex-1">
                    <Text
                      className="text-lg"
                      style={{ color: pick ? gray200 : emerald500 }}
                    >
                      {t("app.player.lyricsPickerServer")}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-md text-primary-100"
                    >
                      {[
                        serverLyrics.displayTitle || track?.title,
                        serverLyrics.displayArtist || track?.artist,
                      ]
                        .filter(Boolean)
                        .join(" ⦁ ")}
                    </Text>
                    <Text className="text-sm text-primary-200">
                      {isSyncedLyrics(serverLyrics)
                        ? t("app.player.lyricsPickerSynced")
                        : t("app.player.lyricsPickerPlain")}
                    </Text>
                  </VStack>
                  {!pick && <Check size={20} color={emerald500} />}
                </HStack>
              </FadeOutScaleDown>
            ) : (
              <FadeOutScaleDown onPress={handleAutomaticPress}>
                <HStack className="items-center justify-between">
                  <Text
                    className="text-lg flex-1"
                    style={{ color: pick ? gray200 : emerald500 }}
                  >
                    {t("app.player.lyricsPickerAutomatic")}
                  </Text>
                  {!pick && <Check size={20} color={emerald500} />}
                </HStack>
              </FadeOutScaleDown>
            )}
            {isLoading && (
              <Box className="py-6 items-center">
                <Spinner color={gray200} />
              </Box>
            )}
            {!isLoading && isError && (
              <Text className="text-primary-100 text-md">
                {t("app.player.lyricsPickerError")}
              </Text>
            )}
            {!isLoading && !isError && results.length === 0 && (
              <Text className="text-primary-100 text-md">
                {t("app.player.lyricsPickerEmpty")}
              </Text>
            )}
            {results.length > 0 && (
              <Text className="text-sm text-primary-200 uppercase tracking-wider">
                {t("app.player.lyricsPickerLrclib")}
              </Text>
            )}
            {results.map((record) => {
              const active = pick?.id === record.id;
              const color = active ? emerald500 : gray200;
              return (
                <FadeOutScaleDown
                  key={record.id}
                  onPress={() => handleResultPress(record)}
                >
                  <HStack className="items-center justify-between gap-x-4">
                    <VStack className="flex-1">
                      <Text className="text-lg" style={{ color }}>
                        {record.trackName}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="text-md text-primary-100"
                      >
                        {record.artistName || t("app.shared.unknownArtist")} ⦁{" "}
                        {record.albumName || t("app.shared.unknownAlbum")}
                      </Text>
                      <Text className="text-sm text-primary-200">
                        {[
                          record.duration != null
                            ? formatSeconds(record.duration)
                            : null,
                          record.syncedLyrics
                            ? t("app.player.lyricsPickerSynced")
                            : t("app.player.lyricsPickerPlain"),
                          record.instrumental
                            ? t("app.player.lyricsPickerInstrumental")
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ⦁ ")}
                      </Text>
                    </VStack>
                    {active && <Check size={20} color={emerald500} />}
                  </HStack>
                </FadeOutScaleDown>
              );
            })}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
