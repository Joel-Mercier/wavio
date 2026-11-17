import { dispatch, isIndexBacked } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/playlists";
import * as L from "@/services/local/playlists";
import * as S from "@/services/openSubsonic/playlists";
import {
  beginPlaylistRead,
  indexedArtistPlaylists,
  loadedArtistPlaylists,
  type PlaylistSource,
} from "@/services/playlistArtistIndex";
import { currentAuthScope } from "@/stores/auth";

export const getPlaylists = dispatch(
  S.getPlaylists,
  J.getPlaylists,
  L.getPlaylists,
);

const fetchPlaylist = dispatch(S.getPlaylist, J.getPlaylist, L.getPlaylist);

export const getPlaylist = async (id: string) => {
  const noteRead = isIndexBacked() ? undefined : beginPlaylistRead();
  const response = await fetchPlaylist(id);
  noteRead?.(response?.playlist);
  return response;
};

const indexSource: PlaylistSource = {
  listPlaylists: () => getPlaylists({}),
  loadPlaylist: fetchPlaylist,
};

const fromIndex = async (artistId: string) => ({
  artistPlaylists: {
    playlist: await indexedArtistPlaylists(artistId, indexSource),
  },
});

export const getArtistPlaylists = dispatch(
  fromIndex,
  fromIndex,
  L.getArtistPlaylists,
);

// What the index already knows, without touching the network. Index-backed
// servers query their database live, so they have nothing to offer here.
export const getCachedArtistPlaylists = (artistId: string) =>
  isIndexBacked()
    ? undefined
    : loadedArtistPlaylists(currentAuthScope(), artistId);

export const createPlaylist = dispatch(
  S.createPlaylist,
  J.createPlaylist,
  L.createPlaylist,
);
export const updatePlaylist = dispatch(
  S.updatePlaylist,
  J.updatePlaylist,
  L.updatePlaylist,
);
export const deletePlaylist = dispatch(
  S.deletePlaylist,
  J.deletePlaylist,
  L.deletePlaylist,
);
