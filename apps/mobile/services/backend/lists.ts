import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/lists";
import * as L from "@/services/local/lists";
import * as N from "@/services/navidrome/songs";
import * as S from "@/services/openSubsonic/lists";

export type { AlbumListType } from "@/services/openSubsonic/lists";

export const getAlbumList = dispatch(
  S.getAlbumList,
  J.getAlbumList,
  L.getAlbumList,
);
export const getAlbumList2 = dispatch(
  S.getAlbumList2,
  J.getAlbumList2,
  L.getAlbumList2,
);
export const getNowPlaying = dispatch(
  S.getNowPlaying,
  J.getNowPlaying,
  L.getNowPlaying,
);
export const getRandomSongs = dispatch(
  S.getRandomSongs,
  J.getRandomSongs,
  L.getRandomSongs,
);
export const getSongsByGenre = dispatch(
  S.getSongsByGenre,
  J.getSongsByGenre,
  L.getSongsByGenre,
);
// The `subsonic` slot is Navidrome's native-API impl (guarded to return empty
// for plain OpenSubsonic, which the `mostPlayedTracks` capability gates off).
export const getMostPlayedSongs = dispatch(
  N.getMostPlayedSongs,
  J.getMostPlayedSongs,
  L.getMostPlayedSongs,
);
export const getStarred = dispatch(S.getStarred, J.getStarred, L.getStarred);
export const getStarred2 = dispatch(
  S.getStarred2,
  J.getStarred2,
  L.getStarred2,
);
