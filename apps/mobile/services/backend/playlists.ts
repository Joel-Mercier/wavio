import { dispatch } from "@/services/backend/dispatch";
import * as J from "@/services/jellyfin/playlists";
import * as S from "@/services/openSubsonic/playlists";

export const getPlaylists = dispatch(S.getPlaylists, J.getPlaylists);
export const getPlaylist = dispatch(S.getPlaylist, J.getPlaylist);
export const createPlaylist = dispatch(S.createPlaylist, J.createPlaylist);
export const updatePlaylist = dispatch(S.updatePlaylist, J.updatePlaylist);
export const deletePlaylist = dispatch(S.deletePlaylist, J.deletePlaylist);
