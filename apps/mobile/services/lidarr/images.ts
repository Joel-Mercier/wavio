import type {
  LidarrAlbum,
  LidarrArtist,
  LidarrMediaCover,
} from "@/services/lidarr/types";

// Lidarr MediaCover.url is a path on the Lidarr server (needs the API key);
// remoteUrl is the absolute source (Cover Art Archive / fanart.tv) that loads
// without auth, so we prefer it.
export function coverUrlFromImages(
  images: LidarrMediaCover[] | undefined,
  preferredType = "cover",
): string | undefined {
  if (!images?.length) return undefined;
  const preferred = images.find((img) => img.coverType === preferredType);
  return (preferred ?? images[0])?.remoteUrl || undefined;
}

export function albumCoverUrl(album: LidarrAlbum): string | undefined {
  return album.remoteCover || coverUrlFromImages(album.images);
}

export function artistImageUrl(artist: LidarrArtist): string | undefined {
  return artist.remotePoster || coverUrlFromImages(artist.images, "poster");
}
