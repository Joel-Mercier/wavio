import type { ServerType } from "@/stores/servers";

export type BackendCapabilities = {
  sharing: boolean;
  internetRadio: boolean;
  // Podcast channels are available. Only OpenSubsonic hosts them on the server
  // (Subsonic getPodcasts/createPodcastChannel); Navidrome returns 501 for the
  // whole podcast section and Jellyfin has no equivalent, so for those (and the
  // local library) channels are self-hosted on-device in the per-(server,user)
  // SQLite store with feeds parsed on-device. See services/backend/podcasts.ts.
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
  // getSimilarSongs — server-computed similar tracks. The on-device library has
  // no recommendation engine, so this is unavailable for local servers.
  similarSongs: boolean;
  // Saving tracks for offline listening. Pointless for the local library, whose
  // files already live on the device (offline mode is disabled for it too).
  offlineDownload: boolean;
  // Extended artist/album metadata — Subsonic getArtistInfo(2)/getAlbumInfo(2)
  // bios, images and similar artists. The on-device library has no such data
  // source, so these queries are skipped (rather than erroring) for local.
  extendedMetadata: boolean;
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
  similarSongs: true,
  offlineDownload: true,
  extendedMetadata: true,
};

const NAVIDROME: BackendCapabilities = {
  ...SUBSONIC,
  smartPlaylists: true,
  // Navidrome registers every podcast endpoint as 501 Not Implemented, so
  // podcasts are self-hosted on-device instead (same flow as the local library;
  // see services/backend/podcasts.ts).
  podcasts: true,
};

const JELLYFIN: BackendCapabilities = {
  sharing: false,
  internetRadio: false,
  // Jellyfin has no podcast section, so podcasts are self-hosted on-device
  // instead (same flow as the local library; see services/backend/podcasts.ts).
  podcasts: true,
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
  similarSongs: true,
  offlineDownload: true,
  extendedMetadata: true,
};

// On-device library: no remote server, everything is derived from files the
// indexer scans (see `stores/servers.ts` `paths`). Synced lyrics and ReplayGain
// come from extracted tags; song lists and (non-smart) playlists are built
// locally. Play counts/last-played (track_stats) and ratings (local-library
// store) are tracked on-device, so setRating and the play-stats home sections
// work. Internet radio stations and podcasts are self-hosted on-device too: the
// same OpenSubsonic-style create/edit/delete flows persist to SQLite, with
// podcast feeds fetched + parsed on-device (services/podcastFeed.ts). Everything
// else that genuinely needs a remote server — sharing, bookmarks, admin users,
// queue/now-playing sync — is unavailable.
const LOCAL: BackendCapabilities = {
  sharing: false,
  internetRadio: true,
  podcasts: true,
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
  similarSongs: false,
  offlineDownload: false,
  extendedMetadata: false,
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
