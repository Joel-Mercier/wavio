import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import AudioLines from "lucide-react-native/icons/audio-lines";
import User from "lucide-react-native/icons/user";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useHiddenTracksToast } from "@/hooks/useHiddenTracksToast";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { allowArtist, unhideTrack } from "@/services/hiddenTracks";
import useApp from "@/stores/app";
import useHiddenTracks, {
  type HiddenArtistEntry,
  type HiddenTrackEntry,
} from "@/stores/hiddenTracks";
import { ARTWORK_THUMB_SIZE, artworkUrl } from "@/utils/artwork";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

type Row =
  | { kind: "header"; key: string; label: string }
  | { kind: "track"; key: string; id: string; entry: HiddenTrackEntry }
  | { kind: "artist"; key: string; id: string; entry: HiddenArtistEntry };

const newestFirst = <T extends { hiddenAt: number }>(
  record: Record<string, T>,
): [string, T][] =>
  Object.entries(record).sort(([, a], [, b]) => b.hiddenAt - a.hiddenAt);

export default function HiddenTracksDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const tracks = useHiddenTracks((state) => state.tracks);
  const artists = useHiddenTracks((state) => state.artists);
  const showToast = useHiddenTracksToast();
  const [showClearAll, setShowClearAll] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    const artistRows = newestFirst(artists);
    const trackRows = newestFirst(tracks);
    if (artistRows.length > 0) {
      next.push({
        kind: "header",
        key: "header:artists",
        label: t("app.hiddenTracks.blockedArtistsHeading", {
          count: artistRows.length,
        }),
      });
      for (const [id, entry] of artistRows) {
        next.push({ kind: "artist", key: `artist:${id}`, id, entry });
      }
    }
    if (trackRows.length > 0) {
      next.push({
        kind: "header",
        key: "header:tracks",
        label: t("app.hiddenTracks.hiddenTracksHeading", {
          count: trackRows.length,
        }),
      });
      for (const [id, entry] of trackRows) {
        next.push({ kind: "track", key: `track:${id}`, id, entry });
      }
    }
    return next;
  }, [tracks, artists, t]);

  const handleUnhideTrack = (id: string, entry: HiddenTrackEntry) => {
    unhideTrack(id);
    showToast(
      t("app.hiddenTracks.trackUnhiddenMessage", {
        title: entry.title || t("app.shared.unknown"),
      }),
    );
  };

  const handleAllowArtist = (id: string, entry: HiddenArtistEntry) => {
    allowArtist(id);
    showToast(
      t("app.hiddenTracks.artistAllowedMessage", {
        name: entry.name || t("app.shared.unknownArtist"),
      }),
    );
  };

  const handleClearAll = () => {
    setShowClearAll(false);
    useHiddenTracks.getState().clearAll();
    showToast(t("app.hiddenTracks.clearAllSuccessMessage"));
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "header") {
      return (
        <Heading size="sm" className="text-gray-300 mt-4 mb-3">
          {item.label}
        </Heading>
      );
    }
    const isArtist = item.kind === "artist";
    const fallbackIcon = isArtist ? (
      <User size={24} color={white} />
    ) : (
      <AudioLines size={24} color={white} />
    );
    return (
      <HStack
        testID={`hidden-${item.kind}-row`}
        className="items-center gap-x-4 py-2"
      >
        <ImageWithFallback
          source={
            item.entry.coverArt
              ? { uri: artworkUrl(item.entry.coverArt, ARTWORK_THUMB_SIZE) }
              : undefined
          }
          className={cn("w-12 h-12 aspect-square", {
            "rounded-full": isArtist,
            "rounded-md": !isArtist,
          })}
          alt={isArtist ? "Artist cover" : "Track cover"}
          fallback={
            <Box
              className={cn(
                "w-12 h-12 bg-primary-600 items-center justify-center",
                { "rounded-full": isArtist, "rounded-md": !isArtist },
              )}
            >
              {fallbackIcon}
            </Box>
          }
        />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {item.kind === "artist"
              ? item.entry.name || t("app.shared.unknownArtist")
              : item.entry.title || t("app.shared.unknown")}
          </Heading>
          {item.kind === "track" && (
            <Text className="text-primary-100" size="sm" numberOfLines={1}>
              {item.entry.artist || t("app.shared.unknownArtist")}
            </Text>
          )}
        </VStack>
        <FadeOutScaleDown
          testID={`hidden-${item.kind}-restore-button`}
          onPress={() =>
            item.kind === "artist"
              ? handleAllowArtist(item.id, item.entry)
              : handleUnhideTrack(item.id, item.entry)
          }
          className="py-2 px-4 rounded-full border border-white"
        >
          <Text className="text-white font-bold">
            {isArtist
              ? t("app.hiddenTracks.allow")
              : t("app.hiddenTracks.unhide")}
          </Text>
        </FadeOutScaleDown>
      </HStack>
    );
  };

  return (
    <Box className="h-full">
      <Box className={cn("px-6 pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center justify-between mb-2"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <Heading className="text-white text-center flex-1" size="lg">
            {t("app.hiddenTracks.screenTitle")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        {rows.length === 0 ? (
          <VStack className="gap-y-2 py-8">
            <Text className="text-white text-center" size="md">
              {t("app.hiddenTracks.empty")}
            </Text>
            <Text className="text-primary-100 text-center" size="sm">
              {t("app.hiddenTracks.emptyHint")}
            </Text>
          </VStack>
        ) : (
          <LegendList
            recycleItems
            data={rows}
            renderItem={renderRow}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.kind}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: screenBottomPadding }}
            ListFooterComponent={
              <FadeOutScaleDown
                testID="hidden-tracks-clear-all-button"
                onPress={() => setShowClearAll(true)}
                className="items-center justify-center py-3 px-8 mt-6 border border-red-500 bg-red-500 rounded-full self-center"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.hiddenTracks.clearAll")}
                </Text>
              </FadeOutScaleDown>
            }
          />
        )}
      </Box>
      <ConfirmActionDialog
        isOpen={showClearAll}
        onClose={() => setShowClearAll(false)}
        title={t("app.hiddenTracks.clearAllConfirmTitle")}
        description={t("app.hiddenTracks.clearAllConfirmDescription")}
        cancelLabel={t("app.shared.cancel")}
        confirmLabel={t("app.hiddenTracks.clearAll")}
        confirmVariant="danger"
        onConfirm={handleClearAll}
      />
    </Box>
  );
}
