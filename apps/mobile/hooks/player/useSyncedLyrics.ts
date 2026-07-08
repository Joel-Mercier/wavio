import { useMemo } from "react";
import { useGetLyricsBySongId } from "@/hooks/backend/useMediaRetrieval";
import { useLrclibLyrics } from "@/hooks/lrclib/useLrclibLyrics";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import type { QueueTrack } from "@/stores/queue";
import { hasKaraoke } from "@/utils/lyrics";

function pickSyncedLyrics(
  list: StructuredLyrics[] | undefined,
): StructuredLyrics | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return (
    list.find((l) => l.synced && hasKaraoke(l)) ??
    list.find((l) => l.synced) ??
    list[0] ??
    null
  );
}

export function useSyncedLyrics(track: QueueTrack | undefined | null) {
  const lyricsSource = useApp((s) => s.lyricsSource);
  const trackId = track?.id;
  const isRadio = !!track?.isRadio;
  const isPodcast = track?.source === "podcast";
  const lyricsEligible =
    !!trackId && !isRadio && !isPodcast && lyricsSource !== "off";
  const backend = useGetLyricsBySongId(
    trackId ?? "",
    { enhanced: true },
    lyricsEligible,
  );
  const list = backend.data?.lyricsList?.structuredLyrics;
  const backendLyrics = useMemo(
    () => pickSyncedLyrics(list?.filter((l) => (l.kind ?? "main") === "main")),
    [list],
  );
  const layers = useMemo(() => {
    return {
      main: backendLyrics,
      translations: list?.filter((l) => l.kind === "translation") ?? [],
      pronunciations: list?.filter((l) => l.kind === "pronunciation") ?? [],
    };
  }, [list, backendLyrics]);

  const backendSettled = lyricsEligible && !backend.isLoading;
  const lrclib = useLrclibLyrics({
    trackName: track?.title,
    artistName: track?.artist,
    albumName: track?.album,
    duration: track?.duration,
    enabled: backendSettled && !backendLyrics && lyricsSource === "all",
  });

  // lrclib's query keeps its cached result after being disabled (staleTime is
  // Infinity), so switching away from "all" must also stop surfacing it here —
  // otherwise the last-played track keeps showing its lrclib lyrics.
  const lyrics =
    backendLyrics ?? (lyricsSource === "all" ? lrclib.lyrics : null);
  const isLoading = backend.isLoading || lrclib.isLoading;
  return {
    lyrics,
    isLoading,
    hasKaraoke: hasKaraoke(lyrics),
    layers,
    hasTranslations: layers.translations.length > 0,
    hasPronunciation: layers.pronunciations.length > 0,
  };
}
