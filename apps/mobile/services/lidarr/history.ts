import { lidarrRequest } from "@/services/lidarr";
import { coverUrlFromImages } from "@/services/lidarr/images";
import type { LidarrMediaCover } from "@/services/lidarr/types";

interface LidarrHistoryRecordRaw {
  id: number;
  albumId?: number;
  trackId?: number;
  sourceTitle?: string;
  date?: string;
  eventType?: string;
  album?: { title?: string; images?: LidarrMediaCover[] };
  artist?: { artistName?: string };
  track?: { title?: string };
}

interface LidarrHistoryResponse {
  records?: LidarrHistoryRecordRaw[];
}

export interface LidarrHistoryItem {
  id: number;
  eventType: string;
  date?: string;
  albumTitle: string;
  trackTitle?: string;
  artistName: string;
  sourceTitle?: string;
  coverUrl?: string;
}

// Event types worth surfacing in the history list (grabs, imports, failures).
const RELEVANT_EVENTS = new Set([
  "grabbed",
  "downloadImported",
  "trackFileImported",
  "albumImportIncomplete",
  "downloadFailed",
  "downloadIgnored",
]);

export async function fetchHistory(): Promise<LidarrHistoryItem[]> {
  const data = await lidarrRequest<LidarrHistoryResponse>("/history", {
    params: {
      page: 1,
      pageSize: 50,
      sortKey: "date",
      sortDirection: "descending",
      includeArtist: true,
      includeAlbum: true,
      includeTrack: true,
    },
  });
  return (data?.records ?? [])
    .filter((r) => !r.eventType || RELEVANT_EVENTS.has(r.eventType))
    .map((r) => ({
      id: r.id,
      eventType: r.eventType ?? "unknown",
      date: r.date,
      albumTitle: r.album?.title || "Unknown album",
      trackTitle: r.track?.title,
      artistName: r.artist?.artistName || "Unknown artist",
      sourceTitle: r.sourceTitle,
      coverUrl: coverUrlFromImages(r.album?.images),
    }));
}
