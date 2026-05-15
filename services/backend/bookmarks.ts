import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/bookmarks";
import * as S from "@/services/openSubsonic/bookmarks";

export const createBookmark = dispatch(S.createBookmark, J.createBookmark);
export const deleteBookmark = dispatch(S.deleteBookmark, J.deleteBookmark);
export const getBookmarks = dispatch(S.getBookmarks, J.getBookmarks);
export const getPlayQueue = dispatch(S.getPlayQueue, J.getPlayQueue);
export const savePlayQueue = dispatch(S.savePlayQueue, J.savePlayQueue);
