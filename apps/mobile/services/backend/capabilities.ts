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
  // A home carousel + "See all" list of the user's globally most-played tracks.
  // Needs a server-side way to sort songs by play count: Jellyfin (Items
  // SortBy=PlayCount), the local library (track_stats.play_count) and Navidrome
  // (native /api/song?_sort=playCount) all provide one; plain OpenSubsonic has
  // no such endpoint (getTopSongs is per-artist only), so it stays off there.
  mostPlayedTracks: boolean;
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
  // Client-chosen server-side transcoding format. Subsonic/Navidrome honour a
  // `format=` param on /stream (transcoding to the named profile); Jellyfin maps
  // it onto the universal endpoint's AudioCodec/TranscodingContainer. The local
  // library plays files off disk, so it exposes no client-pickable format.
  streamFormatSelection: boolean;
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
  mostPlayedTracks: false,
  playQueueSync: true,
  nowPlaying: true,
  similarSongs: true,
  offlineDownload: true,
  extendedMetadata: true,
  streamFormatSelection: true,
};

const NAVIDROME: BackendCapabilities = {
  ...SUBSONIC,
  smartPlaylists: true,
  // Navidrome's native REST API can sort songs by play count even though the
  // Subsonic surface can't — served via services/navidrome/songs.ts.
  mostPlayedTracks: true,
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
  mostPlayedTracks: true,
  // Jellyfin's getPlayQueue/getNowPlaying adapters are inert stubs, so these
  // sync/social surfaces stay hidden until a real adapter exists.
  playQueueSync: false,
  nowPlaying: false,
  similarSongs: true,
  offlineDownload: true,
  extendedMetadata: true,
  // Jellyfin's /Audio/{id}/universal endpoint transcodes to a client-chosen
  // AudioCodec/TranscodingContainer, so the format picker maps onto it just like
  // Subsonic's `format=` param (see services/jellyfin/streaming.ts).
  streamFormatSelection: true,
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
  mostPlayedTracks: true,
  playQueueSync: false,
  nowPlaying: false,
  similarSongs: false,
  offlineDownload: false,
  extendedMetadata: false,
  streamFormatSelection: false,
};

// A few capabilities depend on per-server *config*, not just the server type:
// Navidrome ships sharing and the jukebox disabled by default (returning HTTP
// 501 for their endpoints), and not every OpenSubsonic server hosts podcasts.
// The static matrix above is optimistic for these. The response interceptor
// (services/openSubsonic/index.ts) maps a 501'ing endpoint to the capability it
// gates and flips it off — persisted per (server, user) in
// stores/capabilityOverrides — so the UI stops offering a feature the server
// can't honour.
export const DYNAMIC_CAPABILITY_ENDPOINTS: Record<
  string,
  keyof BackendCapabilities
> = {
  "/rest/getShares": "sharing",
  "/rest/createShare": "sharing",
  "/rest/updateShare": "sharing",
  "/rest/deleteShare": "sharing",
  "/rest/jukeboxControl": "jukebox",
  "/rest/getPodcasts": "podcasts",
  "/rest/getPodcastEpisode": "podcasts",
  "/rest/createPodcastChannel": "podcasts",
  "/rest/deletePodcastChannel": "podcasts",
  "/rest/deletePodcastEpisode": "podcasts",
  "/rest/downloadPodcastEpisode": "podcasts",
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
