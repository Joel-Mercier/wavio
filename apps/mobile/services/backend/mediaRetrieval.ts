import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/mediaRetrieval";
import * as S from "@/services/openSubsonic/mediaRetrieval";

export const stream = dispatch(S.stream, J.stream);
export const hls = dispatch(S.hls, J.hls);
export const download = dispatch(S.download, J.download);
export const getAvatar = dispatch(S.getAvatar, J.getAvatar);
export const getCaptions = dispatch(S.getCaptions, J.getCaptions);
export const getCoverArt = dispatch(S.getCoverArt, J.getCoverArt);
export const getLyrics = dispatch(S.getLyrics, J.getLyrics);
export const getLyricsBySongId = dispatch(
  S.getLyricsBySongId,
  J.getLyricsBySongId,
);
