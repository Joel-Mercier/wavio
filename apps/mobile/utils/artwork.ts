import { isIndexBackedType } from "@/services/backend/serverTraits";
import { artworkUrl as jellyfinArtworkUrl } from "@/services/jellyfin/streaming";
import { getIsEffectivelyOnline } from "@/services/network";
import { subsonicAuthQuery } from "@/services/openSubsonic/auth";
import { useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import { artworkCacheKey } from "@/utils/artworkCacheKey";

const navidromeSubsonicApiVersion =
  process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION || "";
const navidromeClient = process.env.EXPO_PUBLIC_CLIENT_NAME || "";

// Resolves a cover id against the offline artwork cache, following the alias
// table when the id has no file of its own (track covers point at their
// album's, artist ids at the artist's cover — see stores/offline.ts). Takes the
// maps rather than reading the store so React consumers can memoize on them.
export const resolveCachedArtwork = (
  id: string | undefined,
  artworkCache: Record<string, string>,
  artworkAliases: Record<string, string>,
): string | undefined => {
  if (!id) return undefined;
  const key = artworkCacheKey(id);
  const direct = artworkCache[key];
  if (direct) return direct;
  const alias = artworkAliases[key];
  return alias ? artworkCache[alias] : undefined;
};

// Some `coverArt` values are already a URI rather than a server cover id: the
// local backend stores a `file://` path to the artwork it extracted, and
// on-device podcasts (which back Navidrome and Jellyfin too, see
// services/backend/podcasts.ts) store the feed's image URL. Wrapping either in a
// /getCoverArt request would ask the server for an id it never issued.
const isArtworkUri = (id?: string) => !!id && /^(https?|file|data):/i.test(id);

export const artworkUrl = (id?: string, size?: number) => {
  const { url, serverType } = useAuthBase.getState();
  // Covers cached to disk by the extended-offline library sync replace the
  // server URL while it's unreachable, so offline screens keep their artwork.
  // Checked ahead of the index-backed shortcut below, not after: such a backend
  // hands its ids back untouched, and one of them — an on-device podcast's
  // `https://` feed image — is a remote URL that a downloaded episode has a
  // cached copy of and would otherwise dead-end on offline.
  if (id && !getIsEffectivelyOnline()) {
    const { artworkCache, artworkAliases } = useOffline.getState();
    const cached = resolveCachedArtwork(id, artworkCache, artworkAliases);
    if (cached) return cached;
  }
  if (isIndexBackedType(serverType)) return id ?? "";
  if (isArtworkUri(id)) return id as string;
  if (serverType === "jellyfin") return jellyfinArtworkUrl(id, size);
  const sizeParam = size ? `&size=${size}` : "";
  return `${url}/rest/getCoverArt?id=${encodeURIComponent(id ?? "")}&${subsonicAuthQuery()}&v=${navidromeSubsonicApiVersion}&c=${navidromeClient}${sizeParam}`;
};

type ArtworkTrack = {
  artwork?: string;
  coverArt?: string;
  albumId?: string;
};

type ArtworkMaps = {
  artworkCache: Record<string, string>;
  artworkAliases: Record<string, string>;
  downloadedCollections: Record<string, { coverArt?: string }>;
};

// The cover a queue track should render while the server is unreachable. Split
// out of useTrackArtwork so the resolution order is testable without a renderer.
export const resolveOfflineTrackArtwork = (
  track: ArtworkTrack,
  { artworkCache, artworkAliases, downloadedCollections }: ArtworkMaps,
): string | undefined => {
  const cached = resolveCachedArtwork(
    track.coverArt,
    artworkCache,
    artworkAliases,
  );
  if (cached) return cached;

  // Backstop for a track the sync never enumerated (so it has no alias) but
  // whose album collection is registered.
  const albumCoverArt = track.albumId
    ? downloadedCollections[track.albumId]?.coverArt
    : undefined;
  // Resolved through resolveCachedArtwork, never read out of artworkCache
  // directly: a collection stores the *raw* server id while the cache is keyed
  // by artworkCacheKey(), and on Navidrome those differ by the updated-at token
  // every album id carries (`al-<id>_<token>` vs `al-<id>`) — so a direct lookup
  // misses on the one backend this backstop exists for.
  const cachedAlbum = resolveCachedArtwork(
    albumCoverArt,
    artworkCache,
    artworkAliases,
  );
  if (cachedAlbum) return cachedAlbum;

  // Nothing on disk. Fall back to the album's *server* URL rather than the
  // track's own, even though neither can be fetched offline: the album cover is
  // what every list and detail screen renders, so expo-image (cachePolicy
  // "memory-disk", keyed by URL) is holding those bytes from earlier browsing.
  // A track-level cover id is requested nowhere else in the app, so its URL is
  // always a cache miss — which is why the player was the only screen that lost
  // its artwork offline.
  if (albumCoverArt) return artworkUrl(albumCoverArt);

  return track.artwork;
};
