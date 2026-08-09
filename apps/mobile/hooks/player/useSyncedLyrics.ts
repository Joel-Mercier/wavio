import { useMemo } from "react";
import { useGetLyricsBySongId } from "@/hooks/backend/useMediaRetrieval";
import { useLrclibLyrics } from "@/hooks/lrclib/useLrclibLyrics";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import type { QueueTrack } from "@/stores/queue";
import {
  hasKaraoke,
  hasLyricContent,
  sanitizeStructuredLyrics,
} from "@/utils/lyrics";

function pickSyncedLyrics(
  list: StructuredLyrics[] | undefined,
): StructuredLyrics | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  // Entries carrying no text are dropped before picking: an empty one would win
  // the `list[0]` fallback below and then read as "the server has lyrics",
  // blanking the view and skipping LRCLIB for a track it could resolve.
  const withContent = list.filter(hasLyricContent);
  if (withContent.length === 0) return null;
  return (
    withContent.find((l) => l.synced && hasKaraoke(l)) ??
    withContent.find((l) => l.synced) ??
    withContent[0] ??
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
  const list = useMemo(
    () =>
      backend.data?.lyricsList?.structuredLyrics?.map(sanitizeStructuredLyrics),
    [backend.data],
  );
  const backendLyrics = useMemo(
    () => pickSyncedLyrics(list?.filter((l) => (l.kind ?? "main") === "main")),
    [list],
  );
  const backendSettled = lyricsEligible && !backend.isLoading;
  const lrclib = useLrclibLyrics({
    trackId,
    trackName: track?.title,
    artistName: track?.artist,
    albumName: track?.album,
    duration: track?.duration,
    enabled: backendSettled && !backendLyrics && lyricsSource === "all",
  });

  // lrclib's query keeps its cached result after being disabled, so switching
  // away from "all" must also stop surfacing it here — otherwise the
  // last-played track keeps showing its lrclib lyrics.
  const lrclibLyrics = lyricsSource === "all" ? lrclib.lyrics : null;
  // A hand-picked sheet is the one case lrclib outranks the server: the user
  // chose it *because* the automatic result (server's included) was wrong.
  const picked = lrclib.isPicked ? lrclibLyrics : null;
  const lyrics = picked ?? backendLyrics ?? lrclibLyrics;

  const layers = useMemo<{
    main: StructuredLyrics | null;
    translations: StructuredLyrics[];
    pronunciations: StructuredLyrics[];
  }>(() => {
    // The kind layers are the backend's, aligned line-for-line against the
    // backend's own lyrics (alignLayerToMain). A picked sheet has a different
    // line set entirely, so carrying them over would bucket translations onto
    // unrelated lines.
    if (picked) return { main: picked, translations: [], pronunciations: [] };
    return {
      main: backendLyrics,
      translations: list?.filter((l) => l.kind === "translation") ?? [],
      pronunciations: list?.filter((l) => l.kind === "pronunciation") ?? [],
    };
  }, [list, backendLyrics, picked]);

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
