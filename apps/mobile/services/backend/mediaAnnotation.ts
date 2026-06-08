import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/mediaAnnotation";
import * as S from "@/services/openSubsonic/mediaAnnotation";

export type { PlaybackReportState } from "@/services/openSubsonic/mediaAnnotation";

export const star = dispatch(S.star, J.star);
export const unstar = dispatch(S.unstar, J.unstar);
export const setRating = dispatch(S.setRating, J.setRating);
export const scrobble = dispatch(S.scrobble, J.scrobble);
export const reportPlayback = dispatch(S.reportPlayback, J.reportPlayback);
