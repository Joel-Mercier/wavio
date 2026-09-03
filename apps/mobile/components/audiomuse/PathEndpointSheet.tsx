import {
  type BottomSheetModal,
  useBottomSheetScrollableCreator,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import Anchor from "lucide-react-native/dist/esm/icons/anchor.mjs";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SheetSearchInput from "@/components/SheetSearchInput";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useAudioMuseAnchors } from "@/hooks/audioMuse/useAudioMuseAnchors";
import { MIN_QUERY_LENGTH } from "@/hooks/audioMuse/useAudioMuseTextSearch";
import { usePathTrackSearch } from "@/hooks/audioMuse/usePathTrackSearch";
import useDebounce from "@/hooks/useDebounce";
import {
  PATH_MOODS,
  type PathEndpoint,
  type PathMood,
} from "@/services/audioMuse/path";
import type {
  AudioMuseAnchor,
  AudioMuseTrack,
} from "@/services/audioMuse/types";
import { cn } from "@/utils/tailwind";

type PickerMode = "song" | "mood" | "anchor";

// Moods have no icon that reads as the mood rather than as "a face", so each is
// carried by a colour instead — warm for the high-energy end, cool for the calm.
const MOOD_COLORS: Record<PathMood, string> = {
  happy: "bg-amber-400",
  sad: "bg-sky-400",
  aggressive: "bg-red-500",
  relaxed: "bg-teal-400",
  danceable: "bg-fuchsia-500",
};

type PickerRow =
  | { key: string; kind: "song"; track: AudioMuseTrack }
  | { key: string; kind: "mood"; mood: PathMood }
  | { key: string; kind: "anchor"; anchor: AudioMuseAnchor };

/** The label a chosen endpoint reads as, wherever it is shown. */
export function usePathEndpointLabel() {
  const { t } = useTranslation();
  return useCallback(
    (endpoint: PathEndpoint | null): string | null => {
      if (!endpoint) return null;
      switch (endpoint.kind) {
        case "song":
          return endpoint.title || endpoint.itemId;
        case "mood":
          return t(`app.audiomuse.path.moods.${endpoint.mood}`);
        case "anchor":
          return endpoint.name;
      }
    },
    [t],
  );
}

/**
 * Picks one end of a song path: a track from AudioMuse's own catalogue, one of
 * the five moods it holds centroids for, or a saved Alchemy anchor.
 *
 * The mood and anchor modes are withheld rather than offered-and-refused when
 * the request couldn't carry them — the API allows at most one resolved endpoint
 * and none at all in lyrics mode — so a choice made here is always sendable, and
 * choosing never silently undoes the other end.
 */
export default function PathEndpointSheet({
  ref,
  title,
  lyrics,
  otherIsResolved,
  onSelect,
}: {
  ref: React.RefObject<BottomSheetModal | null>;
  title: string;
  /** Lyrics paths run between two songs, so moods and anchors are unavailable. */
  lyrics: boolean;
  /** The other end already holds a mood or anchor, and only one may. */
  otherIsResolved: boolean;
  onSelect: (endpoint: PathEndpoint) => void;
}) {
  const { t } = useTranslation();
  const [emerald500, primary100] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-primary-100",
  ]) as string[];
  const renderScrollComponent = useBottomSheetScrollableCreator();
  const debounce = useDebounce(300);

  const [mode, setMode] = useState<PickerMode>("song");
  const [query, setQuery] = useState("");
  // One sheet serves both ends, so it would otherwise reopen holding whatever
  // was searched for the other one. Bumped on every open to remount the search
  // field, whose text lives inside it.
  const [openCount, setOpenCount] = useState(0);

  const handleChange = useCallback((index: number) => {
    if (index < 0) return;
    setMode("song");
    setQuery("");
    setOpenCount((count) => count + 1);
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      debounce(() => setQuery(text));
    },
    [debounce],
  );

  // Fetched whenever the sheet can offer them at all, because whether the mode
  // is offered depends on the list being non-empty.
  const { data: anchors } = useAudioMuseAnchors({
    enabled: !lyrics && !otherIsResolved,
  });

  const resolvedAllowed = !lyrics && !otherIsResolved;
  const modes = useMemo<PickerMode[]>(() => {
    if (!resolvedAllowed) return ["song"];
    return anchors?.length ? ["song", "mood", "anchor"] : ["song", "mood"];
  }, [resolvedAllowed, anchors]);
  // A mode can disappear under the picker (the other end becomes a mood while
  // this sheet is mounted), so never render a mode that is no longer offered.
  const activeMode = modes.includes(mode) ? mode : "song";

  const { data: tracks, isFetching: isSearching } = usePathTrackSearch(query, {
    lyrics,
    enabled: activeMode === "song",
  });

  const rows = useMemo<PickerRow[]>(() => {
    if (activeMode === "mood") {
      return PATH_MOODS.map((mood) => ({
        key: `mood:${mood}`,
        kind: "mood" as const,
        mood,
      }));
    }
    if (activeMode === "anchor") {
      return (anchors ?? []).map((anchor) => ({
        key: `anchor:${anchor.id}`,
        kind: "anchor" as const,
        anchor,
      }));
    }
    return (tracks ?? []).map((track) => ({
      key: `song:${track.item_id}`,
      kind: "song" as const,
      track,
    }));
  }, [activeMode, anchors, tracks]);

  const handleRowPress = (row: PickerRow) => {
    switch (row.kind) {
      case "song":
        onSelect({
          kind: "song",
          itemId: row.track.item_id,
          title: row.track.title,
          author: row.track.author,
        });
        break;
      case "mood":
        onSelect({ kind: "mood", mood: row.mood });
        break;
      case "anchor":
        onSelect({
          kind: "anchor",
          id: row.anchor.id,
          name: row.anchor.name,
        });
        break;
    }
    ref.current?.dismiss();
  };

  const isQueryTooShort = query.trim().length < MIN_QUERY_LENGTH;

  return (
    <CenteredBottomSheetModal
      ref={ref}
      onChange={handleChange}
      snapPoints={["75%"]}
      enableDynamicSizing={false}
      stackBehavior="push"
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <Box className="px-6 pt-2 pb-3">
        <Heading className="text-white mb-3" size="lg">
          {title}
        </Heading>
        {modes.length > 1 && (
          <HStack className="gap-x-2 mb-3">
            {modes.map((value) => (
              <FadeOutScaleDown key={value} onPress={() => setMode(value)}>
                <Badge
                  className={cn(
                    "rounded-full bg-primary-500 px-4 py-1",
                    activeMode === value && "bg-emerald-500",
                  )}
                >
                  <BadgeText
                    className={cn(
                      "normal-case text-md",
                      activeMode === value ? "text-primary-800" : "text-white",
                    )}
                  >
                    {t(`app.audiomuse.path.modes.${value}`)}
                  </BadgeText>
                </Badge>
              </FadeOutScaleDown>
            ))}
          </HStack>
        )}
        {/* Says why the extra modes aren't here, rather than leaving the row
            looking like a search-only picker on some opens and not others. */}
        {!resolvedAllowed && (
          <Text className="text-primary-100 text-sm mb-3">
            {lyrics
              ? t("app.audiomuse.path.lyricsSongsOnly")
              : t("app.audiomuse.path.oneResolvedEndpoint")}
          </Text>
        )}
        {activeMode === "song" && (
          <SheetSearchInput
            key={openCount}
            onChangeText={handleChangeText}
            placeholder={t("app.audiomuse.path.searchPlaceholder")}
          />
        )}
      </Box>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        renderScrollComponent={renderScrollComponent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <FadeOutScaleDown onPress={() => handleRowPress(item)}>
            <HStack className="items-center px-6 py-3 gap-x-3">
              {item.kind === "song" ? (
                <VStack className="flex-1 gap-y-1">
                  <Text className="text-md text-white" numberOfLines={1}>
                    {item.track.title || item.track.item_id}
                  </Text>
                  <Text className="text-sm text-primary-100" numberOfLines={1}>
                    {[item.track.author, item.track.album]
                      .filter(Boolean)
                      .join(" • ")}
                  </Text>
                </VStack>
              ) : (
                <>
                  <Box className="w-5 items-center">
                    {item.kind === "mood" ? (
                      <Box
                        className={cn(
                          "w-3 h-3 rounded-full",
                          MOOD_COLORS[item.mood],
                        )}
                      />
                    ) : (
                      <Anchor size={20} color={emerald500} />
                    )}
                  </Box>
                  <Text className="text-md text-white flex-1">
                    {item.kind === "mood"
                      ? t(`app.audiomuse.path.moods.${item.mood}`)
                      : item.anchor.name}
                  </Text>
                </>
              )}
            </HStack>
          </FadeOutScaleDown>
        )}
        ListEmptyComponent={
          activeMode !== "song" ? null : isSearching ? (
            <Box className="items-center py-6">
              <Spinner color={primary100} />
            </Box>
          ) : (
            <Text className="text-primary-100 text-center px-6 py-6">
              {isQueryTooShort
                ? t("app.audiomuse.path.searchHint")
                : t("app.audiomuse.path.searchEmpty")}
            </Text>
          )
        }
      />
    </CenteredBottomSheetModal>
  );
}
