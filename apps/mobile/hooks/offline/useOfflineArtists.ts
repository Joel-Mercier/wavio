import { useMemo } from "react";
import { offlineCollectionToAlbum } from "@/services/offline";
import type {
  ArtistID3,
  ArtistsID3,
  ArtistWithAlbumsID3,
} from "@/services/openSubsonic/types";
import { buildArtistIndex } from "@/services/pinyinIndex";
import useOffline, { type OfflineCollection } from "@/stores/offline";

// Offline fallbacks for the artist screens. Artists have no download
// collection of their own — they're derived from the artist/artistId fields of
// the downloaded album collections (which the extended-offline library sync
// registers for the whole server), the same way useOfflineAlbum reconstructs a
// saved album.

function artistAlbums(
  collections: Record<string, OfflineCollection>,
  artistId: string,
): OfflineCollection[] {
  return Object.values(collections).filter(
    (collection) =>
      collection.kind === "album" && collection.artistId === artistId,
  );
}

export function useOfflineArtist(
  id: string | undefined,
): { artist: ArtistWithAlbumsID3 } | undefined {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    if (!id) return undefined;
    const albums = artistAlbums(downloadedCollections, id);
    if (albums.length === 0) return undefined;
    return {
      artist: {
        id,
        name: albums[0].artist ?? "",
        albumCount: albums.length,
        coverArt: albums[0].coverArt,
        album: albums.map((collection) =>
          offlineCollectionToAlbum(collection, downloadedTracks),
        ),
      },
    };
  }, [id, downloadedCollections, downloadedTracks]);
}

export function useOfflineArtists(): { artists: ArtistsID3 } | undefined {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    const byArtist = new Map<string, ArtistID3>();
    for (const collection of Object.values(downloadedCollections)) {
      if (collection.kind !== "album" || !collection.artistId) continue;
      const existing = byArtist.get(collection.artistId);
      if (existing) {
        existing.albumCount += 1;
      } else {
        byArtist.set(collection.artistId, {
          id: collection.artistId,
          name: collection.artist ?? "",
          albumCount: 1,
          coverArt: collection.coverArt,
        });
      }
    }
    if (byArtist.size === 0) return undefined;
    const artists = Array.from(byArtist.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      artists: {
        ignoredArticles: "",
        index: buildArtistIndex(artists, { ignoredArticles: "" }),
      },
    };
  }, [downloadedCollections]);
}
