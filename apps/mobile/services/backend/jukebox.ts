import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/jukebox";
import * as S from "@/services/openSubsonic/jukebox";

export const getJukebox = dispatch(S.getJukebox, J.getJukebox);
export const statusJukebox = dispatch(S.statusJukebox, J.statusJukebox);
export const setJukebox = dispatch(S.setJukebox, J.setJukebox);
export const startJukebox = dispatch(S.startJukebox, J.startJukebox);
export const stopJukebox = dispatch(S.stopJukebox, J.stopJukebox);
export const skipJukebox = dispatch(S.skipJukebox, J.skipJukebox);
export const addJukebox = dispatch(S.addJukebox, J.addJukebox);
export const clearJukebox = dispatch(S.clearJukebox, J.clearJukebox);
export const removeJukebox = dispatch(S.removeJukebox, J.removeJukebox);
export const shuffleJukebox = dispatch(S.shuffleJukebox, J.shuffleJukebox);
export const setGainJukebox = dispatch(S.setGainJukebox, J.setGainJukebox);
