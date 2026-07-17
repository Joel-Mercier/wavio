import { useMemo } from "react";
import {
  collectionArtistCredits,
  collectionCreditsArtist,
  offlineCollectionToAlbum,
} from "@/services/offline";
import type {
  ArtistID3,
  ArtistsID3,
  ArtistWithAlbumsID3,
} from "@/services/openSubsonic/types";
import { buildArtistIndex } from "@/services/pinyinIndex";
import useOffline, { type OfflineCollection } from "@/stores/offline";

// Offline fallbacks for the artist screens. Artists have no download
// collection of their own — they're derived from the artist credits of the
// downloaded album collections (which the extended-offline library sync
// registers for the whole server), the same way useOfflineAlbum reconstructs a
// saved album. A multi-artist album counts for every credited artist, not just
// the primary artistId.

function artistAlbums(
  collections: Record<string, OfflineCollection>,
  artistId: string,
): OfflineCollection[] {
  return Object.values(collections).filter((collection) =>
    collectionCreditsArtist(collection, artistId),
  );
}

function artistNameFromAlbums(
  albums: OfflineCollection[],
  artistId: string,
): string {
  for (const album of albums) {
    const credit = collectionArtistCredits(album).find(
      (artist) => artist.id === artistId,
    );
    if (credit?.name) return credit.name;
  }
  return albums[0]?.artist ?? "";
}

// `enabled: false` short-circuits the derivation (hooks can't be conditional):
// screens pass it when fresh server data is present, so the fallback isn't
// recomputed on every offline-store write just to be discarded.
export function useOfflineArtist(
  id: string | undefined,
  enabled = true,
): { artist: ArtistWithAlbumsID3 } | undefined {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  const downloadedTracks = useOffline((s) => s.downloadedTracks);
  return useMemo(() => {
    if (!enabled || !id) return undefined;
    const albums = artistAlbums(downloadedCollections, id);
    if (albums.length === 0) return undefined;
    return {
      artist: {
        id,
        name: artistNameFromAlbums(albums, id),
        albumCount: albums.length,
        coverArt: albums[0].coverArt,
        album: albums.map((collection) =>
          offlineCollectionToAlbum(collection, downloadedTracks),
        ),
      },
    };
  }, [enabled, id, downloadedCollections, downloadedTracks]);
}

export function useOfflineArtists(
  enabled = true,
): { artists: ArtistsID3 } | undefined {
  const downloadedCollections = useOffline((s) => s.downloadedCollections);
  return useMemo(() => {
    if (!enabled) return undefined;
    const byArtist = new Map<string, ArtistID3>();
    for (const collection of Object.values(downloadedCollections)) {
      for (const credit of collectionArtistCredits(collection)) {
        if (!credit.id) continue;
        const existing = byArtist.get(credit.id);
        if (existing) {
          existing.albumCount += 1;
          if (!existing.name && credit.name) existing.name = credit.name;
        } else {
          byArtist.set(credit.id, {
            id: credit.id,
            name: credit.name,
            albumCount: 1,
            coverArt: collection.coverArt,
          });
        }
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
  }, [enabled, downloadedCollections]);
}
