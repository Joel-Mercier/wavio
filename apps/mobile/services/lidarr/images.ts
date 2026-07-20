import type { LidarrAlbum, LidarrArtist } from "@/services/lidarr/types";

// Lidarr MediaCover.url is a path on the Lidarr server (needs the API key);
// remoteUrl is the absolute source (Cover Art Archive / fanart.tv) that loads
// without auth, so we prefer it.
function pickRemoteUrl(
  images: LidarrAlbum["images"],
  preferredType: string,
): string | undefined {
  if (!images?.length) return undefined;
  const preferred = images.find((img) => img.coverType === preferredType);
  return (preferred ?? images[0])?.remoteUrl || undefined;
}

export function albumCoverUrl(album: LidarrAlbum): string | undefined {
  return album.remoteCover || pickRemoteUrl(album.images, "cover");
}

export function artistImageUrl(artist: LidarrArtist): string | undefined {
  return artist.remotePoster || pickRemoteUrl(artist.images, "poster");
}
