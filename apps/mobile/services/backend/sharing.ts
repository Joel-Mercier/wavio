import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/sharing";
import * as S from "@/services/openSubsonic/sharing";

export const createShare = dispatch(S.createShare, J.createShare);
export const deleteShare = dispatch(S.deleteShare, J.deleteShare);
export const getShares = dispatch(S.getShares, J.getShares);
export const updateShare = dispatch(S.updateShare, J.updateShare);
