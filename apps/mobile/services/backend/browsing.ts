import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/browsing";
import * as L from "@/services/local/browsing";
import * as S from "@/services/openSubsonic/browsing";

export const getMusicFolders = dispatch(
  S.getMusicFolders,
  J.getMusicFolders,
  L.getMusicFolders,
);
export const getAlbum = dispatch(S.getAlbum, J.getAlbum, L.getAlbum);
export const getAlbumInfo = dispatch(S.getAlbumInfo, J.getAlbumInfo);
export const getAlbumInfo2 = dispatch(S.getAlbumInfo2, J.getAlbumInfo2);
export const getArtist = dispatch(S.getArtist, J.getArtist, L.getArtist);
export const getArtistAppearances = dispatch(
  S.getArtistAppearances,
  J.getArtistAppearances,
);
export const getArtistInfo = dispatch(S.getArtistInfo, J.getArtistInfo);
export const getArtistInfo2 = dispatch(S.getArtistInfo2, J.getArtistInfo2);
export const getArtists = dispatch(S.getArtists, J.getArtists, L.getArtists);
export const getGenres = dispatch(S.getGenres, J.getGenres, L.getGenres);
export const getIndexes = dispatch(S.getIndexes, J.getIndexes, L.getIndexes);
export const getMusicDirectory = dispatch(
  S.getMusicDirectory,
  J.getMusicDirectory,
);
export const getPodcastEpisode = dispatch(
  S.getPodcastEpisode,
  J.getPodcastEpisode,
);
export const getSimilarSongs = dispatch(S.getSimilarSongs, J.getSimilarSongs);
export const getSimilarSongs2 = dispatch(
  S.getSimilarSongs2,
  J.getSimilarSongs2,
);
export const getSonicSimilarTracks = dispatch(
  S.getSonicSimilarTracks,
  J.getSonicSimilarTracks,
);
export const getSong = dispatch(S.getSong, J.getSong, L.getSong);
export const getTopSongs = dispatch(
  S.getTopSongs,
  J.getTopSongs,
  L.getTopSongs,
);
export const getVideoInfo = dispatch(S.getVideoInfo, J.getVideoInfo);
export const getVideos = dispatch(S.getVideos, J.getVideos);
