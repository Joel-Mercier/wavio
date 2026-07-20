import { lidarrRequest } from "@/services/lidarr/client";
import type { LidarrMediaCover } from "@/services/lidarr/types";

interface LidarrQueueRecordRaw {
  id: number;
  albumId?: number;
  title?: string;
  status?: string;
  trackedDownloadState?: string;
  trackedDownloadStatus?: string;
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  errorMessage?: string;
  album?: { title?: string; images?: LidarrMediaCover[] };
  artist?: { artistName?: string };
  statusMessages?: { title?: string; messages?: string[] }[];
}

interface LidarrQueueResponse {
  records?: LidarrQueueRecordRaw[];
}

// One entry per album, aggregating the per-track queue records Lidarr returns.
export interface LidarrQueueItem {
  id: string;
  // Raw queue record ids, needed to cancel every track of the album.
  recordIds: number[];
  albumId?: number;
  albumTitle: string;
  artistName: string;
  coverUrl?: string;
  size: number;
  sizeleft: number;
  percentComplete: number;
  trackCount: number;
  status?: string;
  trackedDownloadState?: string;
  timeleft?: string;
  errorMessage?: string;
}

function coverFrom(images: LidarrMediaCover[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const cover = images.find((i) => i.coverType === "cover");
  return (cover ?? images[0])?.remoteUrl || undefined;
}

function groupByAlbum(records: LidarrQueueRecordRaw[]): LidarrQueueItem[] {
  const byKey = new Map<string, LidarrQueueRecordRaw[]>();
  for (const r of records) {
    const key = r.albumId != null ? `album-${r.albumId}` : `record-${r.id}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }
  const out: LidarrQueueItem[] = [];
  for (const [key, arr] of byKey) {
    const first = arr[0];
    const size = arr.reduce((s, r) => s + (r.size ?? 0), 0);
    const sizeleft = arr.reduce((s, r) => s + (r.sizeleft ?? 0), 0);
    const percentComplete =
      size > 0 ? Math.round(((size - sizeleft) / size) * 100) : 0;
    out.push({
      id: key,
      recordIds: arr.map((r) => r.id),
      albumId: first.albumId,
      albumTitle: first.album?.title || first.title || "Unknown album",
      artistName: first.artist?.artistName || "Unknown artist",
      coverUrl: coverFrom(first.album?.images),
      size,
      sizeleft: Math.min(sizeleft, size),
      percentComplete,
      trackCount: arr.length,
      status: first.status,
      trackedDownloadState: first.trackedDownloadState,
      timeleft: first.timeleft,
      errorMessage: arr.find((r) => r.errorMessage)?.errorMessage,
    });
  }
  return out;
}

export async function fetchQueue(): Promise<LidarrQueueItem[]> {
  const data = await lidarrRequest<LidarrQueueResponse>("/queue", {
    params: {
      includeArtist: true,
      includeAlbum: true,
      pageSize: 100,
      sortKey: "timeleft",
      sortDirection: "ascending",
    },
  });
  return groupByAlbum(data?.records ?? []);
}

// Cancels every track record of a queued album, removing it from the download
// client. Not blocklisted, so Lidarr can grab it again later.
export async function cancelQueueItem(item: LidarrQueueItem): Promise<void> {
  await Promise.all(
    item.recordIds.map((id) =>
      lidarrRequest<void>(`/queue/${id}`, {
        method: "DELETE",
        params: { removeFromClient: true, blocklist: false },
      }),
    ),
  );
}

// Album entries present in the previous queue but gone from the current one —
// i.e. downloads that finished (or were removed) since the last poll.
export function detectFinishedQueueItems(
  previous: LidarrQueueItem[],
  current: LidarrQueueItem[],
): LidarrQueueItem[] {
  if (!previous.length) return [];
  const currentIds = new Set(current.map((i) => i.id));
  return previous.filter((i) => !currentIds.has(i.id));
}
