import { dispatch, isNavidromeNative } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/sharing";
import type { ShareTranscodeOptions } from "@/services/navidrome/shares";
import * as N from "@/services/navidrome/shares";
import * as S from "@/services/openSubsonic/sharing";

export type { ShareTranscodeOptions } from "@/services/navidrome/shares";

// `downloadable` is a Navidrome extension to Subsonic createShare; other
// servers never see it, because only Navidrome offers the share options sheet.
export type ShareLinkOptions = {
  transcode?: ShareTranscodeOptions;
  downloadable?: boolean;
};

const createSubsonicShare = dispatch(S.createShare, J.createShare);

export const createShare = (
  id: string,
  options: { description?: string; expires?: number } & ShareLinkOptions,
) =>
  options.transcode && isNavidromeNative()
    ? N.createShare(id, options.transcode, options.downloadable)
    : createSubsonicShare(id, options);
export const deleteShare = dispatch(S.deleteShare, J.deleteShare);
export const getShares = dispatch(S.getShares, J.getShares);
export const updateShare = dispatch(S.updateShare, J.updateShare);
