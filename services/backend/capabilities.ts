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
  setRating: true,
  lyricsSynced: true,
  adminUsers: true,
  libraryScan: true,
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
