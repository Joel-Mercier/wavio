import { FlashList } from "@shopify/flash-list";
import { useTranslation } from "react-i18next";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import GeneratedTrackListActions from "@/components/tracks/GeneratedTrackListActions";
import TrackListItem from "@/components/tracks/TrackListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useHydratedTracks } from "@/hooks/audioMuse/useHydratedTracks";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import useAudioMuse, {
  type AudioMuseIndexScope,
  selectEmptyReason,
} from "@/stores/audioMuse";
import type { QueueSource } from "@/stores/queue";
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
  const screenBottomPadding = useScreenBottomPadding();

  const { data: tracks, isLoading, error } = useHydratedTracks(itemIds);
  const handleTrackPress = useTrackListPress(tracks, source);
  const analyzedTrackCount = useAudioMuse((store) => store.analyzedTrackCount);
  const clapIndexedCount = useAudioMuse((store) => store.clapIndexedCount);

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

  return (
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
        <VStack className="pb-2 gap-y-3">
          <VStack className="gap-y-1 px-6">
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
          <GeneratedTrackListActions
            tracks={tracks ?? []}
            source={source}
            canSave={canSave}
            defaultPlaylistName={defaultPlaylistName}
            queuedMessage={(count) =>
              t("app.audiomuse.results.queued", { count })
            }
          />
          {error && (
            <Box className="px-6">
              <ErrorDisplay error={error} />
            </Box>
          )}
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
  );
}
