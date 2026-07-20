import { lidarrRequest } from "@/services/lidarr/client";

// One interactive-search result (a specific release from an indexer). Only the
// fields the picker shows or needs to grab are modelled.
export interface LidarrRelease {
  guid: string;
  indexerId: number;
  indexer?: string;
  title: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  protocol?: string;
  quality?: { quality?: { name?: string } };
  rejected?: boolean;
  rejections?: string[];
  downloadAllowed?: boolean;
  ageHours?: number;
}

// Interactive search: asks Lidarr's indexers for available releases of an
// album. Requires the album to already exist in Lidarr (internal id). This is a
// live indexer query, so it can take several seconds.
export async function getReleases(albumId: number): Promise<LidarrRelease[]> {
  return lidarrRequest<LidarrRelease[]>("/release", {
    params: { albumId },
  });
}

// Grabs a specific release, handing it to Lidarr's download client.
export async function grabRelease(release: LidarrRelease): Promise<void> {
  await lidarrRequest<void>("/release", {
    method: "POST",
    data: { guid: release.guid, indexerId: release.indexerId },
  });
}
