import { useEffect } from "react";
import { useGetPodcasts } from "@/hooks/backend/usePodcasts";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";

// Keeps "server"-sourced podcast favorites in sync with the active server's
// live podcast channels: patches title/cover when they change and prunes
// favorites whose channel was deleted on the server. Only reconciles favorites
// whose scope matches the active server, so the global favorites store never
// purges another server's favorites when you switch servers. Mirrors
// useSyncServerRadioFavorites.
export function useSyncServerPodcastFavorites() {
  const capabilities = useCapabilities();
  const scope = useCurrentAuthScope();
  const favorites = usePodcasts((s) => s.favoritePodcasts);
  const removeFavoritePodcast = usePodcasts((s) => s.removeFavoritePodcast);
  const updateFavoriteServerPodcast = usePodcasts(
    (s) => s.updateFavoriteServerPodcast,
  );
  const { data, isLoading, isError } = useGetPodcasts({
    enabled: capabilities.podcasts,
  });

  useEffect(() => {
    if (!capabilities.podcasts || isLoading || isError || !scope) return;
    const live = data?.podcasts?.channel ?? [];
    const byId = new Map(live.map((channel) => [channel.id, channel]));
    for (const fav of favorites) {
      if (fav.source !== "server" || fav.scope !== scope) continue;
      const channel = byId.get(fav.uuid);
      if (!channel) {
        removeFavoritePodcast(fav.uuid);
        continue;
      }
      const name = channel.title || channel.url;
      const imageUrl = channel.originalImageUrl || "";
      if (
        name !== fav.name ||
        imageUrl !== fav.imageUrl ||
        channel.coverArt !== fav.coverArt ||
        channel.url !== fav.url
      ) {
        updateFavoriteServerPodcast(fav.uuid, {
          name,
          imageUrl,
          coverArt: channel.coverArt,
          url: channel.url,
        });
      }
    }
  }, [
    data,
    favorites,
    scope,
    capabilities.podcasts,
    isLoading,
    isError,
    removeFavoritePodcast,
    updateFavoriteServerPodcast,
  ]);
}
