import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/podcasts";
import * as L from "@/services/local/podcasts";
import * as S from "@/services/openSubsonic/podcasts";

export const getPodcasts = dispatch(
  S.getPodcasts,
  J.getPodcasts,
  L.getPodcasts,
);
export const getPodcastEpisode = dispatch(
  S.getPodcastEpisode,
  J.getPodcastEpisode,
  L.getPodcastEpisode,
);
export const createPodcastChannel = dispatch(
  S.createPodcastChannel,
  J.createPodcastChannel,
  L.createPodcastChannel,
);
export const deletePodcastChannel = dispatch(
  S.deletePodcastChannel,
  J.deletePodcastChannel,
  L.deletePodcastChannel,
);
export const deletePodcastEpisode = dispatch(
  S.deletePodcastEpisode,
  J.deletePodcastEpisode,
  L.deletePodcastEpisode,
);
export const downloadPodcastEpisode = dispatch(
  S.downloadPodcastEpisode,
  J.downloadPodcastEpisode,
  L.downloadPodcastEpisode,
);
