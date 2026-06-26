import { useMemo } from "react";
import { useGetLyricsBySongId } from "@/hooks/backend/useMediaRetrieval";
import { useLrclibLyrics } from "@/hooks/lrclib/useLrclibLyrics";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import type { QueueTrack } from "@/stores/queue";

function pickSyncedLyrics(
  list: StructuredLyrics[] | undefined,
): StructuredLyrics | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.find((l) => l.synced) ?? list[0] ?? null;
}

export function useSyncedLyrics(track: QueueTrack | undefined | null) {
  const trackId = track?.id;
  const isRadio = !!track?.isRadio;
  const isPodcast = track?.source === "podcast";
  const lyricsEligible = !!trackId && !isRadio && !isPodcast;
  const backend = useGetLyricsBySongId(
    trackId ?? "",
    { enhanced: true },
    lyricsEligible,
  );
  const backendLyrics = useMemo(
    () => pickSyncedLyrics(backend.data?.lyricsList?.structuredLyrics),
    [backend.data],
  );

  const backendSettled = lyricsEligible && !backend.isLoading;
  const lrclib = useLrclibLyrics({
    trackName: track?.title,
    artistName: track?.artist,
    albumName: track?.album,
    duration: track?.duration,
    enabled: backendSettled && !backendLyrics,
  });

  const lyrics = backendLyrics ?? lrclib.lyrics;
  const isLoading = backend.isLoading || lrclib.isLoading;
  return { lyrics, isLoading };
}
