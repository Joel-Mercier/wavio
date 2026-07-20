import { lidarrRequest } from "@/services/lidarr";
import type {
  LidarrAddDefaults,
  LidarrAlbum,
  LidarrArtist,
} from "@/services/lidarr/types";

// Adds an album (and its artist, if not already in Lidarr) and kicks off a
// release search. A single POST /album with the looked-up resource — which
// carries the exact foreign ids — makes this deterministic: no fuzzy name
// matching, no polling for the album to appear.
export async function addAlbum(
  album: LidarrAlbum,
  defaults: LidarrAddDefaults,
  // The interactive release-picker flow adds the album without an automatic
  // search (search: false), then lets the user pick a release explicitly.
  opts: { search?: boolean } = {},
): Promise<LidarrAlbum> {
  const payload = {
    ...album,
    monitored: true,
    anyReleaseOk: true,
    artist: {
      ...album.artist,
      qualityProfileId: defaults.qualityProfileId,
      metadataProfileId: defaults.metadataProfileId,
      rootFolderPath: defaults.rootFolderPath,
      monitored: defaults.monitored,
      monitorNewItems: "none",
      addOptions: {
        monitor: "all",
        monitored: defaults.monitored,
        searchForMissingAlbums: false,
      },
    },
    addOptions: {
      addType: "automatic" as const,
      searchForNewAlbum: opts.search ?? true,
    },
  };
  return lidarrRequest<LidarrAlbum>("/album", {
    method: "POST",
    data: payload,
  });
}

// Returns the album already present in the Lidarr library for this foreign id
// (with download statistics), or null. Used to show the download state on the
// album detail.
export async function getAddedAlbum(
  foreignAlbumId: string,
): Promise<LidarrAlbum | null> {
  const results = await lidarrRequest<LidarrAlbum[]>("/album", {
    params: { foreignAlbumId },
  });
  return results[0] ?? null;
}

// Triggers a release search for an album already in Lidarr.
export async function searchAlbum(albumId: number): Promise<void> {
  await lidarrRequest<void>("/command", {
    method: "POST",
    data: { name: "AlbumSearch", albumIds: [albumId] },
  });
}

async function setAlbumsMonitored(
  albumIds: number[],
  monitored: boolean,
): Promise<void> {
  await lidarrRequest<void>("/album/monitor", {
    method: "PUT",
    data: { albumIds, monitored },
  });
}

// Downloads an album already in Lidarr (e.g. one browsed via an artist's
// discography, added unmonitored): monitor it, then search for a release.
export async function downloadAddedAlbum(albumId: number): Promise<void> {
  await setAlbumsMonitored([albumId], true);
  await searchAlbum(albumId);
}

export async function getArtists(): Promise<LidarrArtist[]> {
  return lidarrRequest<LidarrArtist[]>("/artist");
}

// Ensures an artist exists in Lidarr so we can read its real discography
// (Lidarr only exposes an artist's album list once the artist is in the
// library). Adds it UNMONITORED with no search — a benign metadata-only add
// that downloads nothing — and reports whether it had to create it (so the
// caller can clean it up if the user browses away without adding anything).
export async function ensureArtistForBrowsing(
  artist: { foreignArtistId: string; artistName?: string },
  defaults: LidarrAddDefaults,
): Promise<{ artistId: number; created: boolean }> {
  const existing = (await getArtists()).find(
    (a) => a.foreignArtistId === artist.foreignArtistId,
  );
  if (existing?.id != null) {
    return { artistId: existing.id, created: false };
  }
  const created = await lidarrRequest<LidarrArtist>("/artist", {
    method: "POST",
    data: {
      foreignArtistId: artist.foreignArtistId,
      artistName: artist.artistName,
      qualityProfileId: defaults.qualityProfileId,
      metadataProfileId: defaults.metadataProfileId,
      rootFolderPath: defaults.rootFolderPath,
      monitored: false,
      monitorNewItems: "none",
      addOptions: { monitor: "none", searchForMissingAlbums: false },
    },
  });
  if (created?.id == null) {
    throw new Error("Artist added but no id returned");
  }
  return { artistId: created.id, created: true };
}

export async function getArtistAlbums(
  artistId: number,
): Promise<LidarrAlbum[]> {
  return lidarrRequest<LidarrAlbum[]>("/album", {
    params: { artistId },
  });
}

export async function deleteArtist(artistId: number): Promise<void> {
  await lidarrRequest<void>(`/artist/${artistId}`, {
    method: "DELETE",
    params: { deleteFiles: false, addImportListExclusion: false },
  });
}
