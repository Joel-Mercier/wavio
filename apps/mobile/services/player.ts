import { onlineManager } from "@tanstack/react-query";
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import { queryClient } from "@/config/queryClient";
import { scrobble } from "@/services/backend/mediaAnnotation";
import { streamUrl, trackTranscodeInfo } from "@/services/backend/streaming";
import { fetchEndlessExtension } from "@/services/endlessRadio";
import { reportBreadcrumb, reportError } from "@/services/errorReporting";
import {
  cachedArtworkUri,
  clearArtworkCache,
  ensureArtworkCached,
} from "@/services/lockScreenArtwork";
import {
  getIsOnline,
  getServerReachable,
  probeServer,
  USER_AGENT,
} from "@/services/network";
import type {
  AlbumID3,
  AlbumList2,
  Child,
} from "@/services/openSubsonic/types";
import {
  hasTranscodeRetried,
  mustStreamOverOffline,
  noteStreamOverOffline,
  noteTranscodeRetried,
} from "@/services/playback/decodeFallback";
import { activeRemoteTarget } from "@/services/playback/targets";
import {
  notePlaybackRateChanged,
  playbackReportEnabled,
  reportPaused,
  reportProgress,
  reportStarting,
  reportStopped,
} from "@/services/playbackReport";
import { stopPlayQueueSync } from "@/services/playQueueSync";
import {
  clearPodcastProgress,
  flushPodcastProgress,
  getPodcastResumePosition,
  isPodcastTrack,
  recordPodcastProgress,
  resetPodcastProgressRuntime,
} from "@/services/podcastProgress";
import {
  armResume,
  clearResumePosition,
  getResumePosition,
  loadResumePositions,
  notePlaybackTrack,
  recordResumePosition,
} from "@/services/resumePositions";
import { isActiveServerUrl, rewriteQueueRoutes } from "@/services/routeSwap";
import {
  customHeadersForUrl,
  mergeCustomHeaders,
} from "@/services/serverHeaders";
import {
  checkSleepTimerExpiry,
  consumeSleepEndOfTrack,
  registerSleepTimerPauseHandler,
} from "@/services/sleepTimer";
import {
  cachedTrackUri,
  evictTracks,
  touchCachedTrack,
} from "@/services/trackCache";
import useActivity from "@/stores/activity";
import { clampPodcastPlaybackRate, useAppBase } from "@/stores/app";
import { registerLogoutHandler, useAuthBase } from "@/stores/auth";
import useOffline from "@/stores/offline";
import usePlayHistory from "@/stores/playHistory";
import useQueue, { type QueueSource, type QueueTrack } from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";

// Native engine calls (pause/seek/lock-screen/…) can throw while the
// underlying player is mid-teardown or the media isn't loaded yet; those
// failures are expected and safe to ignore, but surface them in dev so real
// regressions aren't silent.
function logSwallowed(label: string, error: unknown) {
  if (__DEV__) console.warn(`[player] ${label}`, error);
}

// A single ExoPlayer/AVPlayer instance drives all playback. Track changes load
// the next source onto this same player from the `didJustFinish` handler.
const player = createAudioPlayer(null, { updateInterval: 250 });
let loadedTrackId: string | null = null;

// Sleep-timer fade-out: rather than cut playback dead when the minutes timer
// expires, ramp the volume to zero over this window, then pause. Driven by the
// native playback-status ticks (which keep firing during background playback),
// so it works with the screen off. `sleepFadeUntil` is the ramp's end timestamp
// and `sleepFadeFromVolume` the volume to fade from / restore afterwards.
const SLEEP_FADE_MS = 8000;
let sleepFadeUntil: number | null = null;
let sleepFadeFromVolume = 1;

function cancelSleepFade() {
  if (sleepFadeUntil == null) return;
  sleepFadeUntil = null;
  player.volume = sleepFadeFromVolume;
}

let isLoading = false;
let playbackInitialized = false;
// Endless playback extends the queue with similar tracks when it runs dry.
// `endlessFetchInFlight` guards a single in-flight fetch; `endlessPrefetchedSeedId`
// records the tail-track id we've already tried to extend from so the prefetch
// fires once per tail (the status listener ticks ~4×/s); `endlessResumeWhenReady`
// flags that the tail track finished mid-fetch, so the in-flight extension must
// advance onto the first appended track and start it rather than just append.
let endlessFetchInFlight = false;
let endlessPrefetchedSeedId: string | null = null;
let endlessResumeWhenReady = false;

// A resume seek can't be applied the instant a source is replaced — expo-audio
// may not have the media ready, and the bookmark map may still be loading. We
// arm the target here and (re)apply it from the status listener once the player
// reports the track is ready, clearing it after the first application.
let pendingResumeId: string | null = null;
let pendingResumeAt = 0;

export function getActivePlayer(): AudioPlayer {
  return player;
}

let nowPlayingScrobbledId: string | null = null;
let submittedScrobbleId: string | null = null;
// playbackReport path only: the track id whose early classic scrobble the server
// *confirmed*. Used to set ignoreScrobble on the final "stopped" report so the
// server doesn't double-count — but only when the early scrobble actually landed,
// so a failed one falls back to the server's own stopped-count instead of losing
// the play.
let earlyScrobbledId: string | null = null;
let scrobbleStartedAt: number | null = null;
// Tracks the last observed playing flag so the status listener can detect the
// play→pause edge for playbackReport's "paused" report.
let wasPlaying = false;
// The last playback error string reported, so a non-null `status.error` that
// repeats across status ticks is only sent to Sentry once.
let lastReportedPlaybackError: string | null = null;

function isScrobblable(track: QueueTrack): boolean {
  return track.source !== "podcast";
}

function reportNowPlaying(track: QueueTrack) {
  if (nowPlayingScrobbledId === track.id) return;
  nowPlayingScrobbledId = track.id;
  scrobbleStartedAt = Date.now();
  // Log every track the user actually starts playing to the Activity feed,
  // decoupled from the scrobble-count gate below so short/skipped plays (and the
  // very first track after navigating to a list) still register.
  if (isScrobblable(track) && !track.isRadio) {
    useActivity.getState().recordPlay(track, useQueue.getState().source);
  }
  if (!isScrobblable(track)) return;
  // On playbackReport-capable servers the server scrobbles from our state
  // reports, so we emit "starting" instead of the classic now-playing scrobble.
  if (playbackReportEnabled()) {
    reportStarting(track.id, getPlaybackRateFor(track));
  } else {
    scrobble(track.id, { submission: false }).catch(() => {});
  }
}

// Optimistically move a track's album to the front of every cached "recent"
// album list (the Home carousel and the home-screen widget's strip both read
// these). Called at the moment the play is counted — not at track start — so a
// quick skip never populates the sections. Reuses the album's existing cache
// entry when present so we don't drop metadata, else synthesises a minimal one
// from the queue track. The setQueriesData write fires the query-cache
// subscription in services/widget.ts, so the widget updates in the same tick.
function hoistAlbumToRecent(track: QueueTrack) {
  const albumId = typeof track.albumId === "string" ? track.albumId : null;
  if (!albumId) return;
  queryClient.setQueriesData<{ albumList2?: AlbumList2 }>(
    {
      predicate: (query) => {
        const [name, params] = query.queryKey as [
          string,
          { type?: string } | undefined,
        ];
        return name === "albumList2" && params?.type === "recent";
      },
    },
    (old) => {
      const existing = old?.albumList2?.album;
      if (!existing) return old;
      if (existing[0]?.id === albumId) return old;
      const prev = existing.find((a) => a.id === albumId);
      const hoisted: AlbumID3 = prev
        ? { ...prev, played: new Date() }
        : {
            id: albumId,
            name: typeof track.album === "string" ? track.album : "",
            coverArt:
              typeof track.coverArt === "string" ? track.coverArt : undefined,
            artist: typeof track.artist === "string" ? track.artist : undefined,
            artistId:
              typeof track.artistId === "string" ? track.artistId : undefined,
            created: new Date(),
            duration: 0,
            songCount: 0,
            played: new Date(),
          };
      return {
        ...old,
        albumList2: {
          ...old?.albumList2,
          album: [hoisted, ...existing.filter((a) => a.id !== albumId)],
        },
      };
    },
  );
}

// Optimistically bump the played track's playCount in the cached "most played
// tracks" lists and re-sort, so the Home carousel reorders in the same tick the
// server does (a track tied on play count visibly moves up without a refetch).
// A track not already in the cached list is left to the invalidation refetch in
// scheduleRecentlyPlayedRefresh to pull in.
function bumpMostPlayedTracks(trackId: string) {
  const bump = (song: Child[]): Child[] | null => {
    if (!song.some((s) => s.id === trackId)) return null;
    return song
      .map((s) =>
        s.id === trackId ? { ...s, playCount: (s.playCount ?? 0) + 1 } : s,
      )
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  };

  queryClient.setQueriesData<{ songs?: { song?: Child[] } }>(
    { predicate: (query) => query.queryKey[0] === "mostPlayedSongs" },
    (old) => {
      const bumped = old?.songs?.song && bump(old.songs.song);
      if (!bumped) return old;
      return { ...old, songs: { ...old?.songs, song: bumped } };
    },
  );

  queryClient.setQueriesData<{
    pages: { songs?: { song?: Child[] } }[];
    pageParams: unknown[];
  }>(
    { predicate: (query) => query.queryKey[0] === "mostPlayedSongs:infinite" },
    (old) => {
      if (!old) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        const bumped = page?.songs?.song && bump(page.songs.song);
        if (!bumped) return page;
        changed = true;
        return { ...page, songs: { ...page.songs, song: bumped } };
      });
      return changed ? { ...old, pages } : old;
    },
  );
}

// The single "this play is now counted" side effect, called from each site that
// submits a scrobble. Both the Home carousels and the Queue screen's Recently
// played tab must reflect a play at the same moment the server does — and never
// on a quick skip.
function notePlayCounted(track: QueueTrack) {
  hoistAlbumToRecent(track);
  bumpMostPlayedTracks(track.id);
  usePlayHistory.getState().recordPlay(track);
}

// Count a play — and reorder the server's "recently played" — this many seconds
// into playback, rather than at the classic Last.fm halfway/4-min mark, so the
// server (and other clients / the widget) reflect it almost immediately. A quick
// skip before this window doesn't count (nor scrobble to Last.fm/ListenBrainz).
const COUNT_PLAY_AFTER_SECONDS = 5;

function maybeSubmitScrobble(status: AudioStatus) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (!isScrobblable(current)) return;
  const position = effectivePosition(status.currentTime ?? 0);
  const duration = status.duration ?? current.duration ?? 0;

  if (playbackReportEnabled()) {
    // Progress reports keep the server's now-playing session alive. Only while
    // actually playing, so a paused tick doesn't flip the server back to playing.
    if (status.playing) reportProgress(position * 1000);
    // The server would otherwise only count the play on "stopped" (i.e. at track
    // end), so count it ourselves a few seconds in with a classic scrobble for an
    // instant "recently played" reorder. resetScrobbleState() then finalises the
    // track with ignoreScrobble so the server doesn't count it a second time.
    if (
      status.playing &&
      submittedScrobbleId !== current.id &&
      duration >= 30 &&
      position >= COUNT_PLAY_AFTER_SECONDS
    ) {
      const id = current.id;
      submittedScrobbleId = id;
      notePlayCounted(current);
      scrobble(id, {
        submission: true,
        time: scrobbleStartedAt ?? Date.now(),
      })
        .then(() => {
          earlyScrobbledId = id;
          scheduleRecentlyPlayedRefresh();
        })
        .catch(() => {});
    }
    return;
  }

  if (submittedScrobbleId === current.id) return;
  if (duration < 30) return;
  if (position < COUNT_PLAY_AFTER_SECONDS) return;
  submittedScrobbleId = current.id;
  notePlayCounted(current);
  scrobble(current.id, {
    submission: true,
    time: scrobbleStartedAt ?? Date.now(),
  }).catch(() => {});
  scheduleRecentlyPlayedRefresh();
}

function resetScrobbleState() {
  // If the server confirmed our early count for this track (playbackReport path),
  // tell it to ignore the scrobble on "stopped" so the play isn't counted twice.
  const countedThisTrackEarly =
    earlyScrobbledId != null && earlyScrobbledId === nowPlayingScrobbledId;
  // When we didn't count early, a finished playbackReport track may have been
  // counted by the server's own stopped-threshold (short tracks, or a failed
  // early scrobble) — refresh to reconcile. If we already counted early we
  // hoisted + refreshed back then, so skip the redundant refetch here.
  if (
    playbackReportEnabled() &&
    nowPlayingScrobbledId &&
    !countedThisTrackEarly
  ) {
    scheduleRecentlyPlayedRefresh();
  }
  // Finalise the outgoing track for the playbackReport path before clearing
  // local state. No-op when no track is being reported or the extension is off.
  reportStopped(countedThisTrackEarly);
  nowPlayingScrobbledId = null;
  submittedScrobbleId = null;
  earlyScrobbledId = null;
  scrobbleStartedAt = null;
}

// A counted play bumps Navidrome's play_date/play_count, which reorders the
// server-side "recent"/"frequent" album lists and the "most played tracks" list.
// Those back both the Home carousels and the home-screen widget's recent strip,
// so nudge React Query to refetch them — reconciling the optimistic track bump in
// bumpMostPlayedTracks with server truth (new entrants, exact counts). Debounced
// so a burst of skips coalesces into one refetch, and
// `refetchType: "all"` so the widget's observer-less cache entry refetches too
// (the default "active" would skip it) — that refetch drives the widget's cache
// subscription in services/widget.ts.
let recentlyPlayedRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRecentlyPlayedRefresh() {
  if (recentlyPlayedRefreshTimer) return;
  recentlyPlayedRefreshTimer = setTimeout(() => {
    recentlyPlayedRefreshTimer = null;
    queryClient.invalidateQueries({
      refetchType: "all",
      predicate: (query) => {
        const [name, params] = query.queryKey as [
          string,
          { type?: string } | undefined,
        ];
        if (name === "mostPlayedSongs" || name === "mostPlayedSongs:infinite") {
          return true;
        }
        if (name !== "albumList2" && name !== "albumList2:infinite") {
          return false;
        }
        return params?.type === "recent" || params?.type === "frequent";
      },
    });
  }, 1_500);
}

function getReplayGainFactor(track: QueueTrack): number {
  const { replayGainMode, replayGainPreampDb } = useAppBase.getState();
  return computeReplayGainFactor(track, replayGainMode, replayGainPreampDb);
}

// Seek amounts for the podcast transport controls. Asymmetric on purpose: back
// is for catching a missed sentence, forward is for skipping an ad break.
export const PODCAST_SEEK_BACKWARD_SECONDS = 15;
export const PODCAST_SEEK_FORWARD_SECONDS = 30;

// Speed only applies to spoken word — a music track always plays at 1×, so a
// rate left over from a podcast never bleeds into the next album.
function getPlaybackRateFor(track: QueueTrack | null): number {
  if (track?.source !== "podcast") return 1;
  return clampPodcastPlaybackRate(useAppBase.getState().podcastPlaybackRate);
}

// Must run after every player.replace(): the rate is a property of the engine,
// not of the source, but AVPlayer resets it when the item changes.
// `shouldCorrectPitch` keeps a sped-up voice from sounding like a chipmunk; it
// is the native default on both platforms but is set explicitly so a future
// default flip can't silently change how podcasts sound.
function applyPlaybackRate(track: QueueTrack | null) {
  try {
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(getPlaybackRateFor(track));
  } catch (error) {
    logSwallowed("applyPlaybackRate", error);
  }
}

// Only Subsonic/Navidrome honour the `format=` transcode the fallback relies
// on. Jellyfin negotiates its own profile and local files play off disk, so a
// retry there would just reload the identical URL.
function canTranscodeFallback(): boolean {
  const type = useAuthBase.getState().serverType;
  return type === "opensubsonic" || type === "navidrome";
}

// Distinguish a device codec/decoder failure (recoverable by transcoding) from
// a transient stream/network blip (which transcoding wouldn't fix).
function isDecodeError(message: string): boolean {
  return /mediacodec|decoder|decode/i.test(message);
}

// Backends that stream a server-side transcode without a seekable length.
// Subsonic/Navidrome (format=/maxBitRate on /stream) and Jellyfin (the universal
// endpoint's AudioCodec/MaxStreamingBitrate); a seek within such a stream must
// reload it at an offset (Subsonic `timeOffset` / Jellyfin `StartTimeTicks`).
// Local files play off disk and are natively seekable.
function isServerTranscodeBackend(): boolean {
  const type = useAuthBase.getState().serverType;
  return type === "opensubsonic" || type === "navidrome" || type === "jellyfin";
}

// Whether loading this track *now* would give a server-transcoded stream, which
// is served without a seekable length so ExoPlayer can't seek within it (a
// seekTo just restarts it). Such a stream must instead be reloaded at an offset.
// False for anything played off a local URL (downloaded, radio, podcast) or the
// on-device library. True when the decode-error fallback forced a transcode, or
// the streaming settings predict one for this track.
// A prediction, so it only answers for a track that isn't loaded yet — once one
// is loaded, `isTranscodedStream` reports what its URL actually asked for.
function predictTranscodedStream(track: QueueTrack): boolean {
  if (track.isRadio || track.source === "podcast") return false;
  if (!isServerTranscodeBackend()) return false;
  if (
    useOffline.getState().getDownloadedTrack(track.id) &&
    !mustStreamOverOffline(track.id)
  )
    return false;
  // A prefetched copy plays off disk exactly like a download does, so it is
  // natively seekable and no `timeOffset` reload applies.
  if (!mustStreamOverOffline(track.id) && cachedTrackUri(track.id) != null)
    return false;
  if (hasTranscodeRetried(track.id)) return true;
  return trackTranscodeInfo(track).active;
}

// What the currently loaded stream actually is, recorded when its URL was built.
// The prediction depends on the network in use (the cellular streaming format
// and bitrate cap apply only on cellular), so re-deriving it later answers for
// the network the *seek* happens on, not the one the stream was loaded on:
// walking from cellular onto Wi-Fi mid-track would otherwise make a transcoded
// stream look seekable and a scrub restart it from the beginning.
let loadedTranscode: { trackId: string; active: boolean } | null = null;

// Whether the source now loaded in the engine is a server-transcoded stream.
// Falls back to the prediction for a track that isn't loaded yet (the resume
// decision in loadTrack, which runs before the URL exists).
function isTranscodedStream(track: QueueTrack): boolean {
  if (loadedTranscode?.trackId === track.id) return loadedTranscode.active;
  return predictTranscodedStream(track);
}

// Seconds a transcoded stream was requested to start at (Subsonic `timeOffset`).
// The reloaded stream's own clock restarts near 0, so this base is added back to
// every position read to recover the true track position. Reset to 0 on every
// normal (offset-free) load; set when a transcoded seek/resume reloads the URL.
let streamStartOffset = 0;

export function getStreamStartOffset(): number {
  return streamStartOffset;
}

function effectivePosition(raw: number): number {
  return raw + streamStartOffset;
}

// Resolve the freshest source for a track. Queue entries can become stale —
// a track enqueued before it was downloaded still holds its streamUrl, and
// vice versa. Always re-check the offline registry at load time. `timeOffset`
// starts a transcoded stream partway in (seek/resume) and only applies to the
// streamed branch — local/radio/podcast URLs are seekable and ignore it.
// expo-audio routes http(s) sources through an OkHttp data source, which sends
// `okhttp/*` as its User-Agent unless told otherwise — the signature Cloudflare
// scores as a bot. Identify the app the same way the API clients do. Ignored
// for offline/file sources, which never reach the network stack.
function audioSource(uri: string) {
  return {
    uri,
    headers: mergeCustomHeaders(uri, { "User-Agent": USER_AGENT }),
  };
}

// `transcoded` says whether the URL just built asks the server for a transcode,
// which is what makes the stream unseekable — recorded by the caller so a later
// seek doesn't have to re-derive it against a network that may have changed.
function resolveTrackUrl(
  track: QueueTrack,
  timeOffset?: number,
): {
  url: string;
  isOffline: boolean;
  transcoded: boolean;
} {
  // Internet radio streams its own absolute URL — there's no Subsonic
  // /stream?id endpoint for it, and it's never an offline download.
  if (track.isRadio && track.url)
    return { url: track.url, isOffline: false, transcoded: false };
  const downloaded = useOffline.getState().getDownloadedTrack(track.id);
  if (downloaded && !mustStreamOverOffline(track.id))
    return { url: downloaded.path, isOffline: true, transcoded: false };
  // Then the prefetch cache (issue #163). Strictly after downloads: a download is
  // user-owned and permanent, a cache entry is speculative and evictable, so the
  // two never compete for the same track.
  if (!mustStreamOverOffline(track.id)) {
    const cached = cachedTrackUri(track.id);
    if (cached) {
      touchCachedTrack(track.id);
      return { url: cached, isOffline: true, transcoded: false };
    }
  }
  if (track.source === "podcast" && track.url)
    return { url: track.url, isOffline: false, transcoded: false };
  return {
    url: streamUrl(track.id, {
      forceTranscode: hasTranscodeRetried(track.id),
      timeOffset,
    }),
    isOffline: false,
    transcoded: predictTranscodedStream(track),
  };
}

function isPlayableNow(track: QueueTrack): boolean {
  // Both on-disk answers are conditional on the same thing resolveTrackUrl
  // checks: a copy this device already failed to decode is not a copy that can
  // play, and claiming otherwise strands the skip-to-playable scan on a track
  // whose only remaining source is a server it may not be able to reach.
  const playsOffDisk = !mustStreamOverOffline(track.id);
  if (playsOffDisk && useOffline.getState().isTrackDownloaded(track.id))
    return true;
  // A prefetched copy is on disk right now, which is the whole point of the
  // cache: driving into a dead zone keeps playing instead of stalling, and the
  // skip-to-playable scans below route around whatever wasn't cached in time.
  if (playsOffDisk && cachedTrackUri(track.id) != null) return true;
  // Radio streams and third-party podcast enclosures play from an absolute URL
  // on another host (see resolveTrackUrl), so they only need the *device* online
  // — an unreachable server, which is the other half of what makes onlineManager
  // report offline, doesn't stop them. Server-hosted podcast episodes bake the
  // server's own stream URL, so they stay on the server-reachability check.
  const playsOffServer =
    (track.isRadio || track.source === "podcast") &&
    !!track.url &&
    !isActiveServerUrl(track.url);
  if (playsOffServer) return getIsOnline();
  return onlineManager.isOnline();
}

// Resolve a requested start index onto a track that can actually play right
// now. loadAndPlay only ever walks *forward* (wrapping only under repeat-all),
// so starting on an unplayable track whose only playable siblings sit behind it
// would strand the player — scan forward first, then fall back to the earlier
// ones. Returns null when nothing in the list can play.
function resolvePlayableStartIndex(
  tracks: QueueTrack[],
  startIndex: number,
): number | null {
  const from = Math.min(Math.max(startIndex, 0), tracks.length);
  for (let i = from; i < tracks.length; i += 1) {
    if (isPlayableNow(tracks[i])) return i;
  }
  for (let i = 0; i < from; i += 1) {
    if (isPlayableNow(tracks[i])) return i;
  }
  return null;
}

// Walk forward from a starting queue index to find the next track that is
// playable right now (always true online; offline this means downloaded).
// Respects repeat-all wrap. Returns null when nothing in the queue can play.
function findNextPlayableIndex(startIndex: number): number | null {
  const s = useQueue.getState();
  if (s.queue.length === 0) return null;
  const len = s.queue.length;
  const wrap = s.repeatMode === "all";
  let i = startIndex;
  let scanned = 0;
  while (scanned < len) {
    if (i < 0 || i >= len) {
      if (!wrap) return null;
      i = (i + len) % len;
    }
    if (isPlayableNow(s.queue[i])) return i;
    i += 1;
    scanned += 1;
  }
  return null;
}

// Whether the player currently owns the OS lock-screen / media-notification
// controls. Lets applyLockScreen pick the cheap metadata-only update over a
// full (re)activation once the controls are already up.
let lockScreenActive = false;

// Empty/undefined fields must be passed as undefined, not "": the native
// expo-audio Metadata record parses `artworkUrl` into a java.net.URL, and a ""
// (returned for local tracks without cover art) throws MalformedURLException and
// rejects the whole call.
function toLockScreenMetadata(track: QueueTrack, artworkUrl?: string) {
  return {
    title: track.title || undefined,
    artist: track.artist || undefined,
    albumTitle: track.album || undefined,
    artworkUrl: artworkUrl || undefined,
    // Seconds → ms. Gives the media notification an authoritative duration so it
    // doesn't rely on the player's live content duration (which is unknown for
    // transcoded streams served without a length).
    durationMs:
      track.duration && track.duration > 0
        ? Math.round(track.duration * 1000)
        : undefined,
  };
}

// Mirror the cover locally and hand the OS controls the file, replacing whatever
// artwork the initial metadata carried. See services/lockScreenArtwork.ts for
// why the native fetch can't be authenticated.
async function upgradeLockScreenArtwork(
  p: AudioPlayer,
  track: QueueTrack,
  remoteUrl: string,
) {
  const local = await ensureArtworkCached(remoteUrl);
  // The download outlived the track it was for, or the controls were torn down
  // while it ran — either way this metadata is no longer the current one.
  if (!local || loadedTrackId !== track.id || !lockScreenActive) return;
  try {
    p.updateLockScreenMetadata(toLockScreenMetadata(track, local));
  } catch (error) {
    logSwallowed("upgradeLockScreenArtwork", error);
  }
}

function applyLockScreen(p: AudioPlayer, track: QueueTrack) {
  const remoteArtwork = track.artwork || undefined;
  const cached = cachedArtworkUri(remoteArtwork);
  // Prefer the mirrored file. Failing that, pass the remote URL only when it
  // would actually load — with custom headers configured the native fetch is
  // guaranteed to 403, so sending it just burns a request and logs a failure.
  // A local (file://) artwork needs no mirroring and passes straight through.
  const initialArtwork =
    cached ??
    (remoteArtwork && customHeadersForUrl(remoteArtwork)
      ? undefined
      : remoteArtwork);
  const metadata = toLockScreenMetadata(track, initialArtwork);
  // try/catch keeps a rejected metadata update from aborting playback.
  try {
    if (lockScreenActive) {
      // The player already owns the controls — refresh metadata in place.
      // setActiveForLockScreen would tear down and rebuild the native
      // MediaSession (notification flicker / vanish on every track change);
      // updateLockScreenMetadata does not.
      p.updateLockScreenMetadata(metadata);
    } else {
      p.setActiveForLockScreen(true, metadata, {
        showSeekBackward: true,
        showSeekForward: true,
        showSkipPrevious: true,
        showSkipNext: true,
      });
      lockScreenActive = true;
    }
  } catch (error) {
    logSwallowed("applyLockScreen", error);
  }
  // Fire-and-forget: the controls are already up with text, and the artwork
  // lands a moment later. Skipped when the cover is already mirrored (the
  // metadata above carries it) or isn't a remote URL to begin with.
  if (remoteArtwork && !cached) {
    void upgradeLockScreenArtwork(p, track, remoteArtwork);
  }
}

function clearLockScreen(p: AudioPlayer) {
  try {
    p.clearLockScreenControls();
  } catch (error) {
    logSwallowed("clearLockScreenControls", error);
  }
  lockScreenActive = false;
}

function loadTrack(track: QueueTrack | null, autoplay: boolean) {
  if (!track) {
    player.pause();
    clearLockScreen(player);
    loadedTrackId = null;
    loadedTranscode = null;
    return;
  }
  isLoading = true;
  // Nothing is loaded for this track until the URL below is built, so the resume
  // decision falls back to the prediction rather than an earlier load's record.
  loadedTranscode = null;
  // A transcoded stream can't be seeked once loaded, so a saved bookmark is
  // baked into the URL as a Subsonic `timeOffset` (the stream starts there) and
  // the seek arming below is skipped. A seekable source keeps the arm-and-seek
  // resume path.
  // Podcasts resume from their own store on every play, not just for the launch
  // track — see services/podcastProgress.ts for why they can't use bookmarks.
  const resumeAt = isPodcastTrack(track)
    ? getPodcastResumePosition(track)
    : getResumePosition(track);
  const transcodeResume =
    resumeAt != null && resumeAt > 0 && isTranscodedStream(track);
  streamStartOffset = transcodeResume ? resumeAt : 0;
  const { url, isOffline, transcoded } = resolveTrackUrl(
    track,
    transcodeResume ? resumeAt : undefined,
  );
  loadedTranscode = { trackId: track.id, active: transcoded };
  reportBreadcrumb("player", "load", {
    trackId: track.id,
    source: track.source,
    isOffline,
    isRadio: track.isRadio ?? false,
  });
  player.replace(audioSource(url));
  player.volume = getReplayGainFactor(track);
  applyPlaybackRate(track);
  applyLockScreen(player, track);
  // Moving the active track off the launch track disarms resume so returning
  // to it later starts at 0 rather than its stale bookmark.
  notePlaybackTrack(track.id);
  // Resume long tracks from their saved bookmark position. Arm the seek so the
  // status listener re-applies it once the media is ready, and try an
  // immediate best-effort seek too.
  if (resumeAt != null && !transcodeResume) {
    pendingResumeId = track.id;
    pendingResumeAt = resumeAt;
    try {
      player.seekTo(resumeAt);
    } catch (error) {
      logSwallowed("resume seek on load", error);
    }
  } else {
    pendingResumeId = null;
  }
  if (autoplay) {
    player.play();
    reportNowPlaying(track);
    playbackInitialized = true;
  }
  loadedTrackId = track.id;
  isLoading = false;
}

function loadAndPlay(track: QueueTrack | null) {
  resetScrobbleState();
  if (track && !isPlayableNow(track)) {
    // Offline and this track isn't downloaded — hop forward to one that is.
    // Setting currentIndex re-fires the queue subscription which lands us
    // back here with the playable track.
    const q = useQueue.getState();
    const start = q.currentIndex != null ? q.currentIndex + 1 : 0;
    const nextIdx = findNextPlayableIndex(start);
    if (nextIdx != null) {
      q.setCurrentIndex(nextIdx);
      return;
    }
    // Nothing playable in the queue right now.
    player.pause();
    clearLockScreen(player);
    loadedTrackId = null;
    return;
  }
  loadTrack(track, true);
}

// Seconds before a track's end at which we start fetching the endless-playback
// extension, so the appended tracks are queued before playback runs dry and the
// end-of-track advance stays seamless instead of stalling on a network call.
const ENDLESS_PREFETCH_LEAD_SECONDS = 20;

// True when the queue is parked on its final track with no repeat — the point
// at which endless playback must extend it to keep going. Shuffle permutes the
// queue in place rather than traversing it endlessly, so it ends here too.
function atEndlessQueueTail(): boolean {
  const q = useQueue.getState();
  return (
    q.repeatMode === "off" &&
    q.currentIndex != null &&
    q.currentIndex >= q.queue.length - 1
  );
}

// Fetch similar tracks for `seed` and append them to the queue. Guarded to a
// single in-flight fetch. When the tail track finished while a fetch was still
// running (`endlessResumeWhenReady`), this also advances onto the first appended
// track and starts playback; otherwise the fresh tracks just sit at the end and
// the normal end-of-track advance picks them up gaplessly.
function extendEndlessQueue(seed: QueueTrack) {
  if (endlessFetchInFlight) return;
  endlessFetchInFlight = true;
  endlessPrefetchedSeedId = seed.id;
  const parkedId = useQueue.getState().getCurrent()?.id ?? null;
  fetchEndlessExtension(seed)
    .then((tracks) => {
      if (tracks.length === 0) {
        if (endlessResumeWhenReady) {
          try {
            player.seekTo(0);
          } catch (error) {
            logSwallowed("rewind after empty endless fetch", error);
          }
        }
        return;
      }
      useQueue.getState().enqueueEnd(tracks);
      if (endlessResumeWhenReady) {
        useQueue.getState().next();
        // The queue subscription loads the new track on the id change; only
        // load explicitly when the id didn't change (so it never fired).
        const c = useQueue.getState().getCurrent();
        if (c && c.id === parkedId) loadAndPlay(c);
      }
    })
    .catch((error) => {
      reportError(error, {
        area: "player",
        endpoint: "endlessRadio",
        extra: { seedId: seed.id, source: seed.source },
      });
      if (endlessResumeWhenReady) {
        try {
          player.seekTo(0);
        } catch (rewindError) {
          logSwallowed("rewind after failed endless fetch", rewindError);
        }
      }
    })
    .finally(() => {
      endlessFetchInFlight = false;
      endlessResumeWhenReady = false;
    });
}

// A streamed source failed. Tell a genuine bad stream from a transient
// connectivity drop: if the device is offline the loss is environmental;
// otherwise probe the server and treat it as a real failure only when the server
// answers. The probe also accelerates the unreachable-server detection in
// services/network.ts when the server really is gone.
async function confirmServerReachable(): Promise<boolean> {
  if (!getIsOnline()) return false;
  await probeServer();
  return getServerReachable();
}

// How long the post-mortem probe below may take. It runs after playback already
// failed, so it must not linger — a missing answer is itself a data point.
const SOURCE_PROBE_TIMEOUT_MS = 5000;

// Post-mortem on a source expo-audio refused to play. The engine only ever says
// "Source error", which collapses several unrelated causes into one Issue; these
// fields separate them:
// - a stream: the HTTP status and content type the URL actually serves. A 4xx,
//   or a 200 that isn't audio (an error page, or the cover art some servers hand
//   back), is a very different bug from audio the device can't decode.
// - a downloaded file: whether it still exists and how big it is, which tells a
//   pruned/truncated download from a decode failure.
// Never throws: whatever it can't determine is simply absent from the event.
async function describeFailedSource(resolved: {
  url: string;
  isOffline: boolean;
}): Promise<Record<string, unknown>> {
  if (resolved.isOffline) {
    try {
      const file = new File(resolved.url);
      return { fileExists: file.exists, fileSize: file.exists ? file.size : 0 };
    } catch (error) {
      return { fileProbeError: String(error) };
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_PROBE_TIMEOUT_MS);
  try {
    // Ranged so a server that honours it sends two bytes rather than a track;
    // the body is never read and the request is aborted as soon as the headers
    // land, so a server that ignores Range doesn't stream a whole file either.
    const response = await fetch(resolved.url, {
      headers: mergeCustomHeaders(resolved.url, { Range: "bytes=0-1" }),
      signal: controller.signal,
    });
    return {
      probeStatus: response.status,
      probeContentType: response.headers.get("content-type"),
      probeContentLength: response.headers.get("content-length"),
    };
  } catch (error) {
    return { probeError: error instanceof Error ? error.message : "unknown" };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function handlePlaybackStatus(status: AudioStatus) {
  // A genuine engine-level playback failure (decode error, dead stream URL,
  // unreadable offline file). expo-audio clears `error` on a fresh load /
  // successful resume, so dedupe on the message to report each failure once.
  if (status.error && status.error !== lastReportedPlaybackError) {
    lastReportedPlaybackError = status.error;
    const current = useQueue.getState().getCurrent();
    const resolved = current ? resolveTrackUrl(current) : null;
    const needsNetwork = resolved ? !resolved.isOffline : true;
    // A device that can't decode the source (e.g. ALAC ExoPlayer advertises but
    // fails to decode) — re-arm this track to stream through a server transcode
    // and reload it once, before treating it as a failure. A downloaded file
    // can hit the same wall (a raw ALAC saved before the download path learned
    // to transcode it): when the device is online it too can recover by
    // streaming the transcode over the disk file, so allow the fallback for an
    // offline source as long as we still have network to reach the server.
    const canRecoverOfflineViaStream =
      !!resolved?.isOffline && getIsOnline() && getServerReachable();
    // The bad bytes were a prefetched copy (offline source, but no download owns
    // this id). Unlike a download — which the user asked for and we must not
    // delete under them — a cache entry is ours to throw away, and leaving it
    // would keep isPlayableNow promising a file that cannot decode. Dropping it
    // also lets the prefetcher fetch a fresh one.
    if (
      current &&
      resolved?.isOffline &&
      isDecodeError(status.error) &&
      !useOffline.getState().isTrackDownloaded(current.id)
    ) {
      evictTracks([current.id]);
    }
    if (
      current &&
      resolved &&
      (!resolved.isOffline || canRecoverOfflineViaStream) &&
      !current.isRadio &&
      current.source !== "podcast" &&
      isDecodeError(status.error) &&
      canTranscodeFallback() &&
      !hasTranscodeRetried(current.id)
    ) {
      noteTranscodeRetried(current.id);
      if (resolved.isOffline) noteStreamOverOffline(current.id);
      reportBreadcrumb("player", "transcode-fallback", {
        trackId: current.id,
        error: status.error,
        wasOffline: resolved.isOffline,
      });
      loadTrack(current, true);
      return;
    }
    // `source` is a category discriminator, not the URL — group on what the
    // load actually was so offline-file bugs split from transient streams.
    const kind = resolved
      ? resolved.isOffline
        ? "offline-file"
        : current?.isRadio
          ? "radio"
          : "stream"
      : "unknown";
    const errorMessage = status.error;
    const playbackState = status.playbackState;
    const report = async () => {
      // The engine says "Source error" and nothing else — it can't say whether
      // the bytes never arrived, arrived as an error page, or arrived as audio
      // it couldn't decode. Ask the source itself what it is before reporting.
      const diagnostics = resolved
        ? await describeFailedSource(resolved)
        : undefined;
      reportError(new Error(errorMessage), {
        area: "player",
        endpoint: kind,
        extra: {
          trackId: current?.id,
          kind,
          isOffline: resolved?.isOffline ?? null,
          isRadio: current?.isRadio ?? false,
          source: current?.source,
          playbackState,
          // Codec + transcode context so distinct causes of "Source error" split
          // apart: a decode failure (bad/unsupported codec) that the transcode
          // fallback already retried and still failed, vs a non-decode/stream
          // failure. `suffix`/`contentType` name the format that wouldn't play.
          suffix: current?.suffix ?? null,
          contentType: current?.contentType ?? null,
          isDecodeError: isDecodeError(errorMessage),
          transcodeRetried: current ? hasTranscodeRetried(current.id) : false,
          ...diagnostics,
        },
      });
    };
    // Three sources, three verdicts. An internet radio station that stopped
    // serving its stream is a property of the Radio Browser directory (which is
    // full of dead entries), not of this app — every user of that station sees
    // it and no client change fixes it, so it stays a breadcrumb. Offline-file
    // failures (corrupt/missing download) need no network and are always real.
    // A streamed source throws the same engine "Source error" when the server
    // merely blips mid-track as when the stream is genuinely bad — and
    // effective-online lags a real drop by ~24s, so trusting it here
    // over-reports transient losses the offline UI already covers. Confirm the
    // server actually answers before blaming the engine.
    if (kind === "radio") {
      reportBreadcrumb("player", "radio-source-error", {
        trackId: current?.id,
        error: errorMessage,
      });
    } else if (!needsNetwork) {
      void report();
    } else {
      void confirmServerReachable().then((reachable) => {
        if (reachable) void report();
      });
    }
  } else if (!status.error) {
    lastReportedPlaybackError = null;
  }
  // Apply an armed resume seek as soon as the media reports a known duration
  // (i.e. it's loaded enough to seek). Only while still at the start, so a
  // user scrub isn't clobbered, and only once per arming.
  if (pendingResumeId && status.duration > 0) {
    const cur = useQueue.getState().getCurrent();
    if (cur?.id === pendingResumeId && loadedTrackId === pendingResumeId) {
      const target = pendingResumeAt;
      pendingResumeId = null;
      if (Math.abs((status.currentTime ?? 0) - target) > 1.5) {
        try {
          player.seekTo(target);
        } catch (error) {
          logSwallowed("armed resume seek", error);
        }
      }
    } else if (cur?.id !== pendingResumeId) {
      // Track changed out from under us — drop the stale arming.
      pendingResumeId = null;
    }
  }
  if (status.playing) {
    // Advance an in-progress sleep fade off the native tick (works backgrounded).
    // Ramp volume toward zero; once the window elapses, restore the volume for
    // the next play and pause.
    if (sleepFadeUntil != null) {
      const remaining = sleepFadeUntil - Date.now();
      if (remaining <= 0) {
        sleepFadeUntil = null;
        const restore = sleepFadeFromVolume;
        pause();
        player.volume = restore;
        return;
      }
      player.volume = sleepFadeFromVolume * (remaining / SLEEP_FADE_MS);
      return;
    }
    // Native-driven so the minutes sleep timer fires on time even backgrounded,
    // when the JS setTimeout is throttled. The registered handler starts the
    // fade-out; skip the rest of this tick.
    if (checkSleepTimerExpiry()) return;
    const cur = useQueue.getState().getCurrent();
    if (cur) {
      reportNowPlaying(cur);
      if (isPodcastTrack(cur)) {
        // status.duration is what makes a feed that declares no duration work.
        recordPodcastProgress(cur, effectivePosition(status.currentTime ?? 0), {
          duration: status.duration,
        });
      } else {
        recordResumePosition(cur, effectivePosition(status.currentTime ?? 0));
      }
    }
  } else if (wasPlaying && !status.didJustFinish && !isLoading) {
    // Playback paused (UI, lock-screen or OS control). Report it for the
    // playbackReport path; no-op when the extension is off.
    reportPaused(effectivePosition(status.currentTime ?? 0) * 1000);
  }
  wasPlaying = status.playing;
  maybeSubmitScrobble(status);

  // Endless playback: while the queue is parked on its last track and it's near
  // the end, prefetch similar tracks and append them so the end-of-track advance
  // is seamless. `endlessPrefetchedSeedId` keeps this to one fetch per tail.
  if (
    status.playing &&
    status.duration > 0 &&
    useAppBase.getState().endlessPlaybackEnabled &&
    !endlessFetchInFlight
  ) {
    const seed = useQueue.getState().getCurrent();
    const remaining = status.duration - (status.currentTime ?? 0);
    if (
      seed &&
      endlessPrefetchedSeedId !== seed.id &&
      remaining <= ENDLESS_PREFETCH_LEAD_SECONDS &&
      atEndlessQueueTail()
    ) {
      extendEndlessQueue(seed);
    }
  }

  if (status.didJustFinish && !isLoading) {
    const previousId = useQueue.getState().getCurrent()?.id ?? null;
    const previous = useQueue.getState().getCurrent();
    // Fully played — drop any resume bookmark so it doesn't reopen at the end.
    clearResumePosition(previousId);
    clearPodcastProgress(previousId);
    // The queue advance below re-fires the queue subscription, whose skip-flush
    // would otherwise re-create the entry we just cleared. Only matters when the
    // episode has no known duration (with one, the flush hits the end guard and
    // clears anyway) — but that is exactly the RSS-feed case.
    finishedPodcastId = previousId;
    if (
      !playbackReportEnabled() &&
      previousId &&
      submittedScrobbleId !== previousId &&
      previous &&
      isScrobblable(previous)
    ) {
      submittedScrobbleId = previousId;
      notePlayCounted(previous);
      scrobble(previousId, {
        submission: true,
        time: scrobbleStartedAt ?? Date.now(),
      }).catch(() => {});
      scheduleRecentlyPlayedRefresh();
    }
    if (consumeSleepEndOfTrack()) {
      player.pause();
      return;
    }
    // End of queue with no repeat: keep the current track loaded so the
    // player UI keeps its title/artist/cover, just stop playback. If endless
    // playback is enabled and the near-end prefetch hasn't already extended the
    // queue, fall back to fetching now (arming resume so playback restarts once
    // the tracks land) rather than stopping.
    if (atEndlessQueueTail()) {
      const endless = useAppBase.getState().endlessPlaybackEnabled;
      const seed = useQueue.getState().getCurrent();
      const triedThisTail =
        !!seed && endlessPrefetchedSeedId === seed.id && !endlessFetchInFlight;
      if (!endless || !seed || triedThisTail) {
        // Endless off, nothing to seed from, or a prefetch for this tail already
        // came back empty (a hit would have extended the queue, so we'd no
        // longer be at the tail) — genuinely out of content, stop at the end.
        try {
          player.pause();
          // Go through seekTo (not player.seekTo) so a transcoded stream is
          // reloaded at offset 0 and its streamStartOffset is cleared; a raw
          // seek would land at the start of the offset segment, leaving the
          // position stuck at the last seek point instead of the beginning.
          seekTo(0);
        } catch (error) {
          logSwallowed("stop at queue end", error);
        }
        return;
      }
      // The tail finished before the extension landed (prefetch still running,
      // or it never triggered — e.g. a seek straight to the end). Arm resume so
      // the extension advances + starts playback when ready.
      endlessResumeWhenReady = true;
      extendEndlessQueue(seed);
      return;
    }
    // Default path: advance queue and load on the player.
    useQueue.getState().next();
    const c = useQueue.getState().getCurrent();
    if (!c) {
      player.pause();
      clearLockScreen(player);
      return;
    }
    if (c.id === previousId) {
      loadAndPlay(c);
    }
  }
}

const remoteListeners: ReturnType<AudioPlayer["addListener"]>[] = [];
const statusListeners: ReturnType<AudioPlayer["addListener"]>[] = [];

remoteListeners.push(
  player.addListener("remotePrevious", () => {
    skipPrevious();
  }),
);
remoteListeners.push(
  player.addListener("remoteNext", () => {
    skipNext();
  }),
);
statusListeners.push(
  player.addListener("playbackStatusUpdate", handlePlaybackStatus),
);

const appUnsub = useAppBase.subscribe((state, prev) => {
  const cur = useQueue.getState().getCurrent();
  if (
    state.replayGainMode !== prev.replayGainMode ||
    state.replayGainPreampDb !== prev.replayGainPreampDb
  ) {
    if (cur) player.volume = getReplayGainFactor(cur);
  }
  // Applied live rather than at the next load so the speed sheet audibly
  // changes the episode that is playing behind it.
  if (state.podcastPlaybackRate !== prev.podcastPlaybackRate) {
    applyPlaybackRate(cur);
    if (playbackReportEnabled()) {
      notePlaybackRateChanged(getPlaybackRateFor(cur));
    }
  }
});

let lastTrackId: string | null = null;
// The outgoing track itself, not just its id: flushing a podcast position on a
// skip needs its duration and source discriminator too.
let lastTrack: QueueTrack | null = null;
// Set by the didJustFinish handler so the queue advance it triggers doesn't
// re-record the episode it just cleared.
let finishedPodcastId: string | null = null;
let hasHydrated = false;
// When restoring a queue saved on the server, we want the same "load but don't
// auto-play" behaviour as cold-start hydration. This flag tells the next queue
// subscription firing to load silently.
let suppressAutoplayOnce = false;
const queueUnsub = useQueue.subscribe((state) => {
  const current =
    state.currentIndex != null ? state.queue[state.currentIndex] : null;
  const id = current?.id ?? null;
  if (id !== lastTrackId) {
    const outgoing = lastTrack;
    if (
      outgoing &&
      outgoing.id !== finishedPodcastId &&
      isPodcastTrack(outgoing)
    ) {
      // The engine still holds the outgoing episode's position — player.replace
      // happens further down this same callback. A skip is the only way to leave
      // an episode without reaching didJustFinish, so without this it loses up
      // to a full throttle window.
      recordPodcastProgress(
        outgoing,
        effectivePosition(player.currentTime ?? 0),
        {
          duration: player.duration,
          force: true,
        },
      );
    }
    finishedPodcastId = null;
    lastTrackId = id;
    lastTrack = current;
    if (suppressAutoplayOnce) {
      suppressAutoplayOnce = false;
      resetScrobbleState();
      loadTrack(current, false);
      return;
    }
    // A remote target owns playback elsewhere; the local player just tracks
    // metadata so the UI stays in sync.
    if (activeRemoteTarget()) {
      resetScrobbleState();
      return;
    }
    if (!hasHydrated) {
      // Persist rehydration emits a state change before onFinishHydration
      // fires; load the restored track silently so reopening the app does
      // not auto-resume playback.
      resetScrobbleState();
      loadTrack(current, false);
      return;
    }
    loadAndPlay(current);
  }
});

if (
  typeof module !== "undefined" &&
  (module as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot
) {
  (
    module as unknown as { hot: { dispose: (cb: () => void) => void } }
  ).hot.dispose(() => {
    try {
      queueUnsub();
    } catch {}
    try {
      appUnsub();
    } catch {}
    for (const sub of statusListeners) {
      try {
        sub?.remove?.();
      } catch {}
    }
    for (const sub of remoteListeners) {
      try {
        sub?.remove?.();
      } catch {}
    }
    try {
      player.pause();
    } catch {}
    try {
      player.remove();
    } catch {}
  });
}

function hydratePlayerFromQueue() {
  const current = useQueue.getState().getCurrent();
  lastTrackId = current?.id ?? null;
  lastTrack = current;
  // The restored current track is the only one eligible to resume from its saved
  // position; arm before loading so the resume read below honours it.
  armResume(current?.id ?? null);
  if (current && loadedTrackId !== current.id) {
    loadTrack(current, false);
  }
  hasHydrated = true;
  // Bookmarks load asynchronously, so the loadTrack above usually runs before
  // the resume map is populated. Once it lands, arm the resume seek for the
  // restored (and not-yet-played) track so reopening the app lands at the saved
  // position instead of the start.
  if (current && !playbackInitialized) {
    void loadResumePositions().then(() => {
      if (loadedTrackId !== current.id) return;
      if (playbackInitialized || player.playing) return;
      const resumeAt = getResumePosition(current);
      if (resumeAt == null) return;
      pendingResumeId = current.id;
      pendingResumeAt = resumeAt;
      try {
        player.seekTo(resumeAt);
      } catch (error) {
        logSwallowed("resume seek on hydrate", error);
      }
    });
  }
}

if (useQueue.persist.hasHydrated()) {
  hydratePlayerFromQueue();
} else {
  useQueue.persist.onFinishHydration(() => {
    hydratePlayerFromQueue();
  });
}

// Re-arm cold-start hydration semantics when the active (server, user) scope
// changes. The queue store is reset and re-hydrated for the new scope within
// the same JS session, so without this the persisted-queue restore would look
// like a user-initiated track change and auto-play. Resetting hasHydrated makes
// the restored track load silently (and resume from its bookmark) exactly like
// the initial app launch. Call this after useQueue.__reset() (so the queue store
// reports not-hydrated) and before useQueue.persist.rehydrate().
export function resetPlayerForScopeChange() {
  resetScrobbleState();
  try {
    player.pause();
  } catch (error) {
    logSwallowed("pause on scope change", error);
  }
  hasHydrated = false;
  playbackInitialized = false;
  // Persist any in-flight podcast position before dropping the outgoing track:
  // the store is global, so a scope switch must not lose it.
  flushPodcastProgress();
  resetPodcastProgressRuntime();
  lastTrackId = null;
  lastTrack = null;
  pendingResumeId = null;
  if (useQueue.persist.hasHydrated()) {
    hydratePlayerFromQueue();
  } else {
    useQueue.persist.onFinishHydration(() => {
      hydratePlayerFromQueue();
    });
  }
}

// Fully stop and unload playback on logout: stop server queue sync, silence the
// engine and clear its lock-screen / now-playing controls, reset transient
// playback state, then empty the queue. The engine instance itself stays alive
// so a subsequent login can reuse it.
export function stopPlayback() {
  stopPlayQueueSync();
  resetScrobbleState();
  try {
    loadTrack(null, false);
  } catch (error) {
    logSwallowed("stop playback", error);
  }
  playbackInitialized = false;
  hasHydrated = false;
  flushPodcastProgress();
  lastTrackId = null;
  lastTrack = null;
  pendingResumeId = null;
  useQueue.getState().clearQueue();
}

registerLogoutHandler(stopPlayback);
// The mirrored covers belong to the server being left, and every one of them is
// re-derivable, so there's nothing worth keeping across a sign-out.
registerLogoutHandler(clearArtworkCache);

// React to a route swap (primary <-> fallback for the same server).
//
// The next track load re-resolves its URL and follows the new route for free,
// but the *currently loaded* source was handed to the player as an already
// resolved absolute URL: it keeps playing off its buffer and then errors on the
// dead host. handlePlaybackStatus only re-resolves the URL to classify that
// error for Sentry — the sole branch that actually reloads is the decode-error
// transcode fallback — so playback would just stop, and file a bogus report. A
// swap is a *known* event, so re-resolve deliberately and eat a ~1s gap.
let lastRouteUrl = useAuthBase.getState().url;
useAuthBase.subscribe((state) => {
  if (state.url === lastRouteUrl) return;
  const previous = lastRouteUrl;
  lastRouteUrl = state.url;
  // Login (""-> url) and logout (url -> "") are not swaps; logout has its own
  // teardown and login has nothing loaded yet.
  if (!previous || !state.url) return;
  rewriteQueueRoutes();
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  // Downloaded tracks play from disk and radio/podcast sources are absolute
  // URLs on other hosts — none of them care which route the server is on.
  if (current.isRadio || current.source === "podcast") return;
  if (resolveTrackUrl(current).isOffline) return;
  // reloadAtOffset preserves paused-ness, so this is safe either way.
  reloadAtOffset(current, getCurrentTime());
});

// Called from both the UI root and the car session (which is the only caller in
// a headless Android Auto boot, where no screen ever mounts), so it has to be
// safe to invoke twice in one process.
// Holds the in-flight/settled call rather than a "done" flag, so concurrent
// callers share one attempt and a rejected one is retried by the next caller
// instead of leaving background playback silently unconfigured for the process.
let playbackConfigured: Promise<void> | null = null;

export async function configurePlayback() {
  playbackConfigured ??= setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  }).catch((e) => {
    playbackConfigured = null;
    throw e;
  });
  await playbackConfigured;
}

// Returns whether the queue was actually replaced, so callers can tell the user
// when nothing happened.
export function playTracks(
  tracks: QueueTrack[],
  startIndex = 0,
  options?: { shuffleFromRandom?: boolean; source?: QueueSource },
): boolean {
  if (tracks.length === 0) return false;
  const requestedIndex =
    options?.shuffleFromRandom && useQueue.getState().shuffle
      ? Math.floor(Math.random() * tracks.length)
      : startIndex;
  // Offline with nothing playable at or after the requested index, replacing the
  // queue would strand the player: loadAndPlay finds no playable index, pauses
  // and clears the lock screen — silently killing whatever was playing. Land on
  // a playable track instead, or leave the existing queue alone when the list
  // has none at all.
  const index = resolvePlayableStartIndex(tracks, requestedIndex);
  if (index == null) return false;
  const previousId = lastTrackId;
  useQueue.getState().playNow(tracks, index, options?.source ?? null);
  const current = useQueue.getState().getCurrent();
  if (!current) return false;
  // Starting a new track normally auto-plays via the queue subscription, which
  // fires on the id change. Two cases need an explicit push instead: the id
  // didn't change (subscription never fired), or the subscription took a silent
  // load path — during hydration or a server-queue restore (suppressAutoplayOnce
  // / !hasHydrated) it loads the track paused and leaves playbackInitialized
  // false. An explicit user play must start playback regardless. A remote
  // target owns playback elsewhere, so never force the local engine there.
  if (
    current.id === previousId ||
    (!playbackInitialized && !activeRemoteTarget())
  ) {
    loadAndPlay(current);
  }
  return true;
}

// Play `seed` alone, then fill the queue behind it with similar tracks. The
// seed plays immediately rather than after the fetch, so the tap is never
// blocked on a round-trip; offline (or on a backend without similarity) the
// fetch yields nothing and the seed simply plays on its own.
export async function startTrackRadio(seed: QueueTrack): Promise<boolean> {
  // The seed can't play (offline and not downloaded) — nothing to build a radio
  // around, and playTracks left the queue as it was.
  if (
    !playTracks([seed], 0, {
      source: { type: "similar", name: seed.title ?? "" },
    })
  ) {
    return false;
  }
  let extras: QueueTrack[] = [];
  try {
    extras = await fetchEndlessExtension(seed);
  } catch (error) {
    reportError(error, {
      area: "player",
      endpoint: "startTrackRadio",
      extra: { seedId: seed.id },
    });
    // The seed is playing either way — only the extension failed.
    return true;
  }
  if (extras.length === 0) return true;
  // The user may have started another radio while this was in flight; those
  // tracks belong to a queue that no longer exists.
  if (useQueue.getState().getCurrent()?.id !== seed.id) return true;
  useQueue.getState().enqueueEnd(extras);
  return true;
}

// Replace the queue with one restored from the server, positioned at `index`
// and `positionSeconds`, without auto-playing. Resets playbackInitialized so
// the user's first play re-loads the track (and applies the seek reliably).
export function restoreServerQueue(
  tracks: QueueTrack[],
  index: number,
  positionSeconds: number,
) {
  if (tracks.length === 0) return;
  suppressAutoplayOnce = true;
  playbackInitialized = false;
  // Explicit null: the server queue carries no "Playing from …" context.
  useQueue.getState().setQueue(tracks, index, null);
  if (positionSeconds > 0) {
    // setQueue fired the queue subscription synchronously, so loadTrack has
    // already armed pendingResumeAt from whatever the track's own resume source
    // says. Arm the restored position over it (as takeOverFromRemote does)
    // rather than only raw-seeking: the status listener re-applies the armed
    // value once the media is ready and would otherwise undo this seek.
    const current = useQueue.getState().getCurrent();
    if (current) {
      pendingResumeId = current.id;
      pendingResumeAt = positionSeconds;
    }
    try {
      player.seekTo(positionSeconds);
    } catch (error) {
      logSwallowed("seek to restored position", error);
    }
  }
}

// Append to the queue without ever starting playback. Appending is silent while
// something is already queued, but on an empty queue enqueueEnd has to set
// currentIndex, and the queue subscription reads that new current track as a
// cue to play — so "Add to queue" would start playing, which is the Play
// button's job and not what the label promises.
// Returns how many tracks were appended, so callers can report what happened.
export function enqueueWithoutAutoplay(tracks: QueueTrack[]): number {
  if (tracks.length === 0) return 0;
  if (useQueue.getState().getCurrent() == null) {
    suppressAutoplayOnce = true;
  }
  return useQueue.getState().enqueueEnd(tracks);
}

// Take over playback locally from a (now stopped) remote target — a jukebox
// session, a UPnP renderer: load the current queue track and resume it at the
// position the remote reached. Arms the pending-resume seek so it re-applies
// once the media is ready.
export function takeOverFromRemote(positionSeconds: number, shouldPlay = true) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (shouldPlay) {
    loadAndPlay(current);
  } else {
    loadTrack(current, false);
  }
  const pos = Math.max(0, Math.floor(positionSeconds));
  if (pos > 0) {
    pendingResumeId = current.id;
    pendingResumeAt = pos;
    try {
      player.seekTo(pos);
    } catch (error) {
      logSwallowed("seek to remote takeover position", error);
    }
  }
}

export function togglePlayPause() {
  const remote = activeRemoteTarget();
  if (remote) {
    remote.togglePlayPause();
    return;
  }
  if (player.playing) {
    player.pause();
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackId !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  player.play();
}

export function pause() {
  // A manual pause during a sleep fade takes over: drop the ramp and restore
  // volume so a later resume isn't stuck quiet.
  cancelSleepFade();
  const remote = activeRemoteTarget();
  if (remote) {
    remote.pause();
    return;
  }
  // Persist the resume position immediately on pause rather than waiting for
  // the next throttled tick that may never come once playback stops.
  const current = useQueue.getState().getCurrent();
  if (current) {
    if (isPodcastTrack(current)) {
      recordPodcastProgress(
        current,
        effectivePosition(player.currentTime ?? 0),
        { duration: player.duration, force: true },
      );
    } else {
      recordResumePosition(
        current,
        effectivePosition(player.currentTime ?? 0),
        {
          force: true,
        },
      );
    }
  }
  player.pause();
}

// Sleep-timer expiry handler: start a volume ramp when playing locally, letting
// the status tick carry it to zero and then pause. If nothing is actively
// playing locally (a remote target owns playback, or we're already paused)
// there's no tick to drive the ramp, so just pause outright.
function beginSleepFade() {
  if (activeRemoteTarget() || !player.playing) {
    pause();
    return;
  }
  sleepFadeFromVolume = player.volume ?? 1;
  sleepFadeUntil = Date.now() + SLEEP_FADE_MS;
}

registerSleepTimerPauseHandler(beginSleepFade);

export function play() {
  // Resuming during a sleep fade means "keep listening" — abort the ramp and
  // restore full volume before playing.
  cancelSleepFade();
  const remote = activeRemoteTarget();
  if (remote) {
    remote.play();
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackId !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  player.play();
}

export function getCurrentTime() {
  const remote = activeRemoteTarget();
  if (remote) return remote.getCurrentTime();
  return effectivePosition(player.currentTime ?? 0);
}

export function isPlaying() {
  const remote = activeRemoteTarget();
  if (remote) return remote.isPlaying();
  return player.playing;
}

export function skipNext() {
  const state = useQueue.getState();
  if (state.queue.length === 0 || state.currentIndex == null) return;
  if (state.repeatMode === "off") {
    if (state.currentIndex >= state.queue.length - 1) return;
  }
  const remote = activeRemoteTarget();
  if (remote) {
    remote.skipNext();
    return;
  }
  state.next();
}

export function skipPrevious(options?: { force?: boolean }) {
  const remote = activeRemoteTarget();
  if (remote) {
    remote.skipPrevious();
    return;
  }
  if (!options?.force && effectivePosition(player.currentTime) > 3) {
    seekTo(0);
    return;
  }
  const queue = useQueue.getState();
  // At the start of the playback order with no repeat there is no previous
  // target — restart the current track instead of letting previous() clear the
  // queue position (which would unload it).
  const atStart = queue.repeatMode !== "all" && (queue.currentIndex ?? 0) <= 0;
  if (atStart) {
    seekTo(0);
    return;
  }
  queue.previous();
}

// Seek within a transcoded stream by re-requesting it at an offset (Subsonic
// `timeOffset` / Jellyfin `StartTimeTicks`) and playing on from there — the
// loaded stream itself isn't seekable, so a plain player.seekTo just restarts
// it. The same track keeps playing, so the scrobble/now-playing state is
// intentionally left intact.
function reloadAtOffset(track: QueueTrack, seconds: number) {
  const wasPlaying = player.playing;
  streamStartOffset = Math.max(0, seconds);
  const { url, transcoded } = resolveTrackUrl(track, streamStartOffset);
  loadedTranscode = { trackId: track.id, active: transcoded };
  player.replace(audioSource(url));
  player.volume = getReplayGainFactor(track);
  applyPlaybackRate(track);
  pendingResumeId = null;
  if (wasPlaying) player.play();
}

export function seekTo(seconds: number) {
  const remote = activeRemoteTarget();
  if (remote) {
    remote.seekTo(seconds);
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (current && isTranscodedStream(current)) {
    reloadAtOffset(current, seconds);
    return;
  }
  player.seekTo(seconds);
}

// Relative seek behind the podcast transport's back/forward buttons. Clamped to
// the media's bounds so a tap near either end lands on the edge instead of being
// dropped by the engine, and routed through seekTo so it keeps working on a
// remote output and on a transcoded stream (which seeks by re-requesting).
// The queue track's own duration wins over the player's: on a transcoded stream
// the loaded media only spans from the current offset onwards.
export function seekBy(deltaSeconds: number) {
  const current = useQueue.getState().getCurrent();
  const duration =
    current?.duration && current.duration > 0
      ? current.duration
      : (player.duration ?? 0);
  const target = Math.max(0, getCurrentTime() + deltaSeconds);
  seekTo(duration > 0 ? Math.min(target, duration) : target);
}
