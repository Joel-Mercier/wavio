import { FlashList } from "@shopify/flash-list";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import Save from "lucide-react-native/dist/esm/icons/save.mjs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import SaveGeneratedPlaylistDialog from "@/components/audiomuse/SaveGeneratedPlaylistDialog";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useHydratedTracks } from "@/hooks/audioMuse/useHydratedTracks";
import { useHasPlayableTracks } from "@/hooks/offline";
import { useIsPlaying, usePlayingTrack } from "@/hooks/player";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import {
  enqueueWithoutAutoplay,
  playTracks,
  togglePlayPause,
} from "@/services/player";
import useAudioMuse, {
  type AudioMuseIndexScope,
  selectEmptyReason,
} from "@/stores/audioMuse";
import type { QueueSource } from "@/stores/queue";
import { childToTrack } from "@/utils/childToTrack";
import { loadingData } from "@/utils/loadingData";

// Every AudioMuse generator and search ends here: a ranked list of item ids
// becomes a playable, saveable track list. Hydration lives in the hook so the
// backend — not this component — decides how ids resolve.
export default function AudioMuseResults({
  itemIds,
  source,
  emptyMessage,
  canSave = true,
  defaultPlaylistName,
  indexScope = "analysis",
}: {
  itemIds: string[];
  source: QueueSource;
  emptyMessage?: string;
  canSave?: boolean;
  /** Pre-fills the save dialog when the generator implies a name. */
  defaultPlaylistName?: string;
  /** Which AudioMuse index produced these ids, so an empty list can be explained. */
  indexScope?: AudioMuseIndexScope;
}) {
  const { t } = useTranslation();
  const [white, gray500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
  ]) as string[];
  const screenBottomPadding = useScreenBottomPadding();
  const { showSuccessToast } = useSettingsToast();
  const [isSaveOpen, setIsSaveOpen] = useState(false);

  const { data: tracks, isLoading, error } = useHydratedTracks(itemIds);
  const handleTrackPress = useTrackListPress(tracks, source);
  const isPlaying = useIsPlaying();
  const playingTrack = usePlayingTrack();
  const analyzedTrackCount = useAudioMuse((store) => store.analyzedTrackCount);
  const clapIndexedCount = useAudioMuse((store) => store.clapIndexedCount);

  const trackIdSet = useMemo(
    () => new Set((tracks ?? []).map((track) => track.id)),
    [tracks],
  );
  const isPlayingFromList = !!(playingTrack && trackIdSet.has(playingTrack.id));
  const hasPlayableTracks = useHasPlayableTracks(tracks);

  const handlePlayPress = () => {
    if (isPlayingFromList) {
      togglePlayPause();
      return;
    }
    if (!tracks?.length) return;
    playTracks(tracks.map(childToTrack), 0, { source });
  };

  const handleQueuePress = () => {
    if (!tracks?.length) return;
    const added = enqueueWithoutAutoplay(tracks.map(childToTrack));
    if (added === 0) return;
    showSuccessToast(t("app.audiomuse.results.queued", { count: added }));
  };

  // The generator answers with ids the library may no longer have; saying so
  // beats silently returning a shorter playlist than the count promised.
  const missingCount = tracks ? itemIds.length - tracks.length : 0;

  // An empty result set usually means the query matched nothing — but on a
  // deployment that never finished (or never ran) an analysis it means the index
  // is empty, and no rephrasing will ever help. Say which it is.
  const emptyReason = selectEmptyReason(
    { analyzedTrackCount, clapIndexedCount },
    indexScope,
  );
  const resolvedEmptyMessage =
    emptyReason === "notAnalyzed"
      ? t("app.audiomuse.notScanned.library")
      : emptyReason === "clapNotIndexed"
        ? t("app.audiomuse.notScanned.clap")
        : emptyMessage;

  const hasTracks = !!tracks?.length;
  const actionColor = hasTracks ? white : gray500;

  return (
    <>
      <FlashList
        data={isLoading ? loadingData(8) : (tracks ?? [])}
        renderItem={({ item, index }) =>
          isLoading ? (
            <TrackListItemSkeleton index={index} className="px-6" />
          ) : (
            <TrackListItem
              track={item}
              index={index}
              onPress={handleTrackPress}
              showCoverArt
              className="px-6"
            />
          )
        }
        ListHeaderComponent={
          <VStack className="px-6 pb-2 gap-y-3">
            <VStack className="gap-y-1">
              <Text className="text-primary-100" numberOfLines={1}>
                {t("app.shared.songCount", { count: tracks?.length ?? 0 })}
              </Text>
              {missingCount > 0 && (
                <Text className="text-primary-100 text-sm">
                  {t("app.audiomuse.results.missing", {
                    count: missingCount,
                  })}
                </Text>
              )}
            </VStack>
            <HStack className="items-center justify-between">
              <HStack className="items-center gap-x-6 flex-1 pr-4">
                {canSave && (
                  <FadeOutScaleDown
                    onPress={hasTracks ? () => setIsSaveOpen(true) : undefined}
                  >
                    <HStack className="items-center gap-x-2">
                      <Save size={16} color={actionColor} />
                      <Text className="text-white font-bold">
                        {t("app.audiomuse.results.saveAction")}
                      </Text>
                    </HStack>
                  </FadeOutScaleDown>
                )}
                <FadeOutScaleDown
                  onPress={hasTracks ? handleQueuePress : undefined}
                >
                  <HStack className="items-center gap-x-2">
                    <ListPlus size={16} color={actionColor} />
                    <Text className="text-white font-bold">
                      {t("app.audiomuse.results.queueAction")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </HStack>
              <PlayPauseButton
                isPlaying={isPlayingFromList && isPlaying}
                onPress={handlePlayPress}
                size={48}
                iconSize={24}
                color={white}
                className="bg-emerald-500"
                disabled={!isPlayingFromList && !hasPlayableTracks}
              />
            </HStack>
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
        ListEmptyComponent={
          isLoading ? null : resolvedEmptyMessage ? (
            <Text className="text-primary-100 text-center px-6 my-4">
              {resolvedEmptyMessage}
            </Text>
          ) : (
            <EmptyDisplay />
          )
        }
        contentContainerStyle={{ paddingBottom: screenBottomPadding }}
        showsVerticalScrollIndicator={false}
      />
      <SaveGeneratedPlaylistDialog
        isOpen={isSaveOpen}
        onClose={() => setIsSaveOpen(false)}
        trackIds={(tracks ?? []).map((track) => track.id)}
        defaultName={defaultPlaylistName}
      />
    </>
  );
}
