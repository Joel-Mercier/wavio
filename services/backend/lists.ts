import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/lists";
import * as S from "@/services/openSubsonic/lists";

export type { AlbumListType } from "@/services/openSubsonic/lists";

export const getAlbumList = dispatch(S.getAlbumList, J.getAlbumList);
export const getAlbumList2 = dispatch(S.getAlbumList2, J.getAlbumList2);
export const getNowPlaying = dispatch(S.getNowPlaying, J.getNowPlaying);
export const getRandomSongs = dispatch(S.getRandomSongs, J.getRandomSongs);
export const getSongsByGenre = dispatch(S.getSongsByGenre, J.getSongsByGenre);
export const getStarred = dispatch(S.getStarred, J.getStarred);
export const getStarred2 = dispatch(S.getStarred2, J.getStarred2);
