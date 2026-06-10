import type { ServerType } from "@/stores/servers";

export type BackendCapabilities = {
  sharing: boolean;
  internetRadio: boolean;
  // Server-hosted podcast channels (Subsonic getPodcasts/createPodcastChannel).
  // Navidrome returns 501 for the whole podcast section and Jellyfin has no
  // equivalent, so this is opensubsonic-only.
  podcasts: boolean;
  smartPlaylists: boolean;
  bookmarks: boolean;
  setRating: boolean;
  lyricsSynced: boolean;
  adminUsers: boolean;
  libraryScan: boolean;
  playlistDescription: boolean;
  replayGain: boolean;
  jukebox: boolean;
  songLists: boolean;
  // Server-side play queue persistence (Subsonic getPlayQueue/savePlayQueue)
  // used to resume the same queue + position on another device.
  playQueueSync: boolean;
  // Subsonic getNowPlaying — what other users on the server are listening to.
  nowPlaying: boolean;
};

const SUBSONIC: BackendCapabilities = {
  sharing: true,
  internetRadio: true,
  podcasts: true,
  smartPlaylists: false,
  bookmarks: true,
  setRating: true,
  lyricsSynced: true,
  adminUsers: true,
  libraryScan: true,
  playlistDescription: true,
  replayGain: true,
  jukebox: true,
  songLists: false,
  playQueueSync: true,
  nowPlaying: true,
};

const NAVIDROME: BackendCapabilities = {
  ...SUBSONIC,
  smartPlaylists: true,
  // Navidrome registers every podcast endpoint as 501 Not Implemented.
  podcasts: false,
};

const JELLYFIN: BackendCapabilities = {
  sharing: false,
  internetRadio: false,
  podcasts: false,
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
  songLists: true,
  // Jellyfin's getPlayQueue/getNowPlaying adapters are inert stubs, so these
  // sync/social surfaces stay hidden until a real adapter exists.
  playQueueSync: false,
  nowPlaying: false,
};

// On-device library: no remote server, everything is derived from files the
// indexer scans (see `stores/servers.ts` `paths`). Synced lyrics and ReplayGain
// come from extracted tags; song lists and (non-smart) playlists are built
// locally. Play counts/last-played (track_stats) and ratings (local-library
// store) are tracked on-device, so setRating and the play-stats home sections
// work. Everything else that needs a remote server — sharing, podcasts, radio,
// bookmarks, admin users, queue/now-playing sync — is unavailable.
const LOCAL: BackendCapabilities = {
  sharing: false,
  internetRadio: false,
  podcasts: false,
  smartPlaylists: false,
  bookmarks: false,
  setRating: true,
  lyricsSynced: true,
  adminUsers: false,
  // The indexer can re-scan the selected source folders on demand.
  libraryScan: true,
  playlistDescription: false,
  replayGain: true,
  jukebox: false,
  songLists: true,
  playQueueSync: false,
  nowPlaying: false,
};

export function getCapabilities(serverType: ServerType): BackendCapabilities {
  switch (serverType) {
    case "jellyfin":
      return JELLYFIN;
    case "navidrome":
      return NAVIDROME;
    case "local":
      return LOCAL;
    default:
      return SUBSONIC;
  }
}
