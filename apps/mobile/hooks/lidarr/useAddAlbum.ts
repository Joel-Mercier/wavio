import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  addAlbum,
  downloadAddedAlbum,
  getAddedAlbum,
  type LidarrAddDefaults,
  type LidarrAlbum,
} from "@/services/lidarr";
import useLidarr from "@/stores/lidarr";
import { useLidarrProfiles } from "./useLidarrProfiles";

// Resolves the add-option defaults from the store, filling any unset value from
// the Lidarr instance (root folder's defaults, else the first profile/folder).
// Returns null until at least a root folder and a quality profile are known.
export function useResolvedAddDefaults(): {
  defaults: LidarrAddDefaults | null;
  isLoading: boolean;
} {
  const storedQuality = useLidarr((s) => s.qualityProfileId);
  const storedMetadata = useLidarr((s) => s.metadataProfileId);
  const storedRoot = useLidarr((s) => s.rootFolderPath);
  const monitorAdded = useLidarr((s) => s.monitorAdded);
  const { qualityProfiles, metadataProfiles, rootFolders, isLoading } =
    useLidarrProfiles();

  const defaults = useMemo<LidarrAddDefaults | null>(() => {
    const rootFolder =
      rootFolders.find((f) => f.path === storedRoot) ?? rootFolders[0];
    if (!rootFolder) return null;
    const qualityProfileId =
      storedQuality ??
      rootFolder.defaultQualityProfileId ??
      qualityProfiles[0]?.id;
    if (qualityProfileId == null) return null;
    const metadataProfileId =
      storedMetadata ??
      rootFolder.defaultMetadataProfileId ??
      metadataProfiles[0]?.id ??
      0;
    return {
      qualityProfileId,
      metadataProfileId,
      rootFolderPath: rootFolder.path,
      monitored: monitorAdded,
    };
  }, [
    storedQuality,
    storedMetadata,
    storedRoot,
    monitorAdded,
    qualityProfiles,
    metadataProfiles,
    rootFolders,
  ]);

  return { defaults, isLoading };
}

// Whether an album is already in the Lidarr library (added previously).
export function useLidarrAddedAlbum(foreignAlbumId: string | undefined) {
  const isConnected = useLidarr((s) => s.isConnected);
  const id = (foreignAlbumId ?? "").trim();
  return useQuery({
    queryKey: ["lidarr", "addedAlbum", id],
    queryFn: () => getAddedAlbum(id),
    enabled: isConnected && id.length > 0,
    staleTime: 1000 * 30,
  });
}

export function useAddAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      album,
      defaults,
      search,
    }: {
      album: LidarrAlbum;
      defaults: LidarrAddDefaults;
      search?: boolean;
    }) => addAlbum(album, defaults, { search }),
    onSuccess: (_data, { album }) => {
      queryClient.invalidateQueries({
        queryKey: ["lidarr", "addedAlbum", album.foreignAlbumId],
      });
      queryClient.invalidateQueries({ queryKey: ["lidarr", "queue"] });
    },
  });
}

// Downloads an album already in Lidarr (monitors it, then searches). Covers
// both a monitored-but-not-downloaded album and one browsed via an artist's
// discography (added unmonitored).
export function useDownloadAddedAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (albumId: number) => downloadAddedAlbum(albumId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", "queue"] });
      queryClient.invalidateQueries({ queryKey: ["lidarr", "addedAlbum"] });
    },
  });
}
