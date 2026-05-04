import { useMemo } from "react";
import { useGetLyricsBySongId } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { StructuredLyrics } from "@/services/openSubsonic/types";

function pickSyncedLyrics(
  list: StructuredLyrics[] | undefined,
): StructuredLyrics | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.find((l) => l.synced) ?? list[0] ?? null;
}

export function useSyncedLyrics(trackId: string | undefined) {
  const { data, isLoading } = useGetLyricsBySongId(
    trackId ?? "",
    { enhanced: true },
    !!trackId,
  );
  const list = data?.lyricsList?.structuredLyrics;
  const lyrics = useMemo(() => pickSyncedLyrics(list), [list]);
  return { lyrics, isLoading };
}
