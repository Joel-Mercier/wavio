import type { ServerType } from "@/stores/servers";

export type BackendCapabilities = {
  sharing: boolean;
  internetRadio: boolean;
  smartPlaylists: boolean;
  bookmarks: boolean;
  setRating: boolean;
  lyricsSynced: boolean;
  adminUsers: boolean;
  libraryScan: boolean;
  playlistDescription: boolean;
  replayGain: boolean;
  jukebox: boolean;
};

const SUBSONIC: BackendCapabilities = {
  sharing: true,
  internetRadio: true,
  smartPlaylists: false,
  bookmarks: true,
  setRating: true,
  lyricsSynced: true,
  adminUsers: true,
  libraryScan: true,
  playlistDescription: true,
  replayGain: true,
  jukebox: true,
};

const NAVIDROME: BackendCapabilities = {
  ...SUBSONIC,
  smartPlaylists: true,
};

const JELLYFIN: BackendCapabilities = {
  sharing: false,
  internetRadio: false,
  smartPlaylists: false,
  bookmarks: false,
  // Jellyfin only exposes thumbs-up/down via Likes; there's no 1-5 numeric
  // rating analogous to Subsonic's userRating.
  setRating: false,
  lyricsSynced: true,
  adminUsers: true,
  libraryScan: true,
  playlistDescription: false,
  // Jellyfin's BaseItemDto does not expose ReplayGain tags, so client-side
  // gain adjustment has no data to act on.
  replayGain: false,
  jukebox: false,
};

export function getCapabilities(serverType: ServerType): BackendCapabilities {
  switch (serverType) {
    case "jellyfin":
      return JELLYFIN;
    case "navidrome":
      return NAVIDROME;
    default:
      return SUBSONIC;
  }
}
