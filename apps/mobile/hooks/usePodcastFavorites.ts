import { useCallback, useMemo } from "react";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useSyncServerFavorites } from "@/hooks/useServerFavoritesSync";
import type { PodcastChannel } from "@/services/openSubsonic/types";
import { useCurrentAuthScope } from "@/stores/auth";
import usePodcasts, {
  type FavoritePodcast,
  podcastFavoritesForScope,
} from "@/stores/podcasts";

// Favorite podcasts visible for the active server: Taddy favorites plus the
// "server"-sourced channels that belong to the current auth scope.
export function useScopedPodcastFavorites(): FavoritePodcast[] {
  const scope = useCurrentAuthScope();
  const favorites = usePodcasts((s) => s.favoritePodcasts);
  return useMemo(
    () => podcastFavoritesForScope(favorites, scope),
    [favorites, scope],
  );
}

const channelId = (channel: PodcastChannel) => channel.id;
const favoriteUuid = (fav: FavoritePodcast) => fav.uuid;

// Keeps "server"-sourced podcast favorites in sync with the active server's
// live podcast channels: patches title/cover when they change and prunes
// favorites whose channel was deleted on the server.
export function useSyncServerPodcastFavorites() {
  const capabilities = useCapabilities();
  const favorites = usePodcasts((s) => s.favoritePodcasts);
  const removeFavoritePodcast = usePodcasts((s) => s.removeFavoritePodcast);
  const updateFavoriteServerPodcast = usePodcasts(
    (s) => s.updateFavoriteServerPodcast,
  );
  const { data, isLoading, isError } = useGetPodcasts({
    enabled: capabilities.podcasts,
  });

  const reconcile = useCallback(
    (fav: FavoritePodcast, channel: PodcastChannel) => {
      const name = channel.title || channel.url;
      const imageUrl = channel.originalImageUrl || "";
      const authorName = channel.author || "";
      if (
        name !== fav.name ||
        imageUrl !== fav.imageUrl ||
        channel.coverArt !== fav.coverArt ||
        channel.url !== fav.url ||
        authorName !== fav.authorName
      ) {
        updateFavoriteServerPodcast(fav.uuid, {
          name,
          imageUrl,
          coverArt: channel.coverArt,
          url: channel.url,
          authorName,
        });
      }
    },
    [updateFavoriteServerPodcast],
  );

  useSyncServerFavorites({
    enabled: capabilities.podcasts,
    isLoading,
    isError,
    live: data?.podcasts?.channel ?? [],
    liveId: channelId,
    favorites,
    favoriteId: favoriteUuid,
    remove: removeFavoritePodcast,
    reconcile,
  });
}
