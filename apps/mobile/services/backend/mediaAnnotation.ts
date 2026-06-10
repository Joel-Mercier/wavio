import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/mediaAnnotation";
import * as L from "@/services/local/mediaAnnotation";
import * as S from "@/services/openSubsonic/mediaAnnotation";

export type { PlaybackReportState } from "@/services/openSubsonic/mediaAnnotation";

export const star = dispatch(S.star, J.star, L.star);
export const unstar = dispatch(S.unstar, J.unstar, L.unstar);
export const setRating = dispatch(S.setRating, J.setRating, L.setRating);
export const scrobble = dispatch(S.scrobble, J.scrobble, L.scrobble);
export const reportPlayback = dispatch(
  S.reportPlayback,
  J.reportPlayback,
  L.reportPlayback,
);
