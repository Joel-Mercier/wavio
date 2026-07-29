import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import AudioMuseResults from "@/components/audiomuse/AudioMuseResults";
import ErrorDisplay from "@/components/ErrorDisplay";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { VStack } from "@/components/ui/vstack";
import {
  useLyricsSearch,
  useSoundSearch,
} from "@/hooks/audioMuse/useAudioMuseTextSearch";
import type { QueueSource } from "@/stores/queue";
import { loadingData } from "@/utils/loadingData";

// The Sound and Lyrics tabs of the search screen. Both run the query the user
// already typed against AudioMuse's semantic indexes and hand the ranked ids to
// the shared results list, so a search result behaves exactly like a generated
// playlist: playable, queueable and saveable.
export default function AudioMuseSearchResults({
  query,
  mode,
}: {
  query: string;
  mode: "sound" | "lyrics";
}) {
  const { t } = useTranslation();
  // Both hooks must run (rules of hooks), but only the active mode's query is
  // enabled — gating on `enabled` rather than blanking the query keeps each
  // tab's cache entry keyed by the real search term, so switching back to a tab
  // already visited resolves from cache instead of refetching.
  const sound = useSoundSearch(query, { enabled: mode === "sound" });
  const lyrics = useLyricsSearch(query, { enabled: mode === "lyrics" });
  const { data, isLoading, error } = mode === "sound" ? sound : lyrics;

  const itemIds = useMemo(
    () => (data ?? []).map((track) => track.item_id).filter(Boolean),
    [data],
  );

  const source = useMemo<QueueSource>(
    () => ({ type: "audiomuse", name: query }),
    [query],
  );

  if (error) return <ErrorDisplay error={error as Error} />;

  if (isLoading) {
    return (
      <VStack>
        {loadingData(8).map((item, index) => (
          <TrackListItemSkeleton key={item.id} index={index} className="px-6" />
        ))}
      </VStack>
    );
  }

  return (
    <AudioMuseResults
      itemIds={itemIds}
      source={source}
      emptyMessage={t(`app.audiomuse.search.${mode}Empty`)}
      indexScope={mode === "sound" ? "clap" : "lyrics"}
    />
  );
}
