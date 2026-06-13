import * as L from "@/services/local/podcasts";
import * as S from "@/services/openSubsonic/podcasts";
import { useAuthBase } from "@/stores/auth";

// Only OpenSubsonic has native server-hosted podcasts. Navidrome returns 501 for
// the whole podcast section and Jellyfin has no equivalent, so for those (and the
// local library) podcasts reuse the on-device SQLite store + on-device feed
// parsing — identical to local mode (services/local/podcasts.ts). The generic
// dispatch() can't express this (Navidrome falls through to the subsonic branch),
// hence this dedicated server-vs-local router.
const podcastDispatch = <F extends (...args: never[]) => unknown>(
  server: F,
  // biome-ignore lint/suspicious/noExplicitAny: structural-match across backends
  local: (...args: any[]) => any,
): F =>
  ((...args: Parameters<F>) =>
    useAuthBase.getState().serverType === "opensubsonic"
      ? server(...args)
      : local(...args)) as F;

export const getPodcasts = podcastDispatch(S.getPodcasts, L.getPodcasts);
export const getPodcastEpisode = podcastDispatch(
  S.getPodcastEpisode,
  L.getPodcastEpisode,
);
export const createPodcastChannel = podcastDispatch(
  S.createPodcastChannel,
  L.createPodcastChannel,
);
export const deletePodcastChannel = podcastDispatch(
  S.deletePodcastChannel,
  L.deletePodcastChannel,
);
export const deletePodcastEpisode = podcastDispatch(
  S.deletePodcastEpisode,
  L.deletePodcastEpisode,
);
export const downloadPodcastEpisode = podcastDispatch(
  S.downloadPodcastEpisode,
  L.downloadPodcastEpisode,
);
