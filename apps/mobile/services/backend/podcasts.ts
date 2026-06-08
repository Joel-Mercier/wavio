import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/podcasts";
import * as S from "@/services/openSubsonic/podcasts";

export const getPodcasts = dispatch(S.getPodcasts, J.getPodcasts);
export const getPodcastEpisode = dispatch(
  S.getPodcastEpisode,
  J.getPodcastEpisode,
);
export const createPodcastChannel = dispatch(
  S.createPodcastChannel,
  J.createPodcastChannel,
);
export const deletePodcastChannel = dispatch(
  S.deletePodcastChannel,
  J.deletePodcastChannel,
);
export const deletePodcastEpisode = dispatch(
  S.deletePodcastEpisode,
  J.deletePodcastEpisode,
);
export const downloadPodcastEpisode = dispatch(
  S.downloadPodcastEpisode,
  J.downloadPodcastEpisode,
);
