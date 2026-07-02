import { onlineManager } from "@tanstack/react-query";
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { queryClient } from "@/config/queryClient";
import { scrobble } from "@/services/backend/mediaAnnotation";
import { streamUrl } from "@/services/backend/streaming";
import { fetchEndlessExtension } from "@/services/endlessRadio";
import { reportBreadcrumb, reportError } from "@/services/errorReporting";
import {
  jukeboxGetCurrentTime,
  jukeboxIsPlaying,
  jukeboxPause as jukeboxPauseAction,
  jukeboxPlay as jukeboxPlayAction,
  jukeboxSeekTo,
  jukeboxSkipNext,
  jukeboxSkipPrevious,
  jukeboxTogglePlayPause,
} from "@/services/jukebox";
import {
  getIsOnline,
  getServerReachable,
  probeServer,
} from "@/services/network";
import type { AlbumID3, AlbumList2 } from "@/services/openSubsonic/types";
import {
  playbackReportEnabled,
  reportPaused,
  reportProgress,
  reportStarting,
  reportStopped,
} from "@/services/playbackReport";
import { stopPlayQueueSync } from "@/services/playQueueSync";
import {
  armResume,
  clearResumePosition,
  getResumePosition,
  loadResumePositions,
  notePlaybackTrack,
  recordResumePosition,
} from "@/services/resumePositions";
import {
  consumeSleepEndOfTrack,
  registerSleepTimerPauseHandler,
} from "@/services/sleepTimer";
import { useAppBase } from "@/stores/app";
import { registerLogoutHandler, useAuthBase } from "@/stores/auth";
import useJukebox from "@/stores/jukebox";
import useOffline from "@/stores/offline";
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
  if (!isScrobblable(track)) return;
  // On playbackReport-capable servers the server scrobbles from our state
  // reports, so we emit "starting" instead of the classic now-playing scrobble.
  if (playbackReportEnabled()) {
    reportStarting(track.id);
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

// Count a play — and reorder the server's "recently played" — this many seconds
// into playback, rather than at the classic Last.fm halfway/4-min mark, so the
// server (and other clients / the widget) reflect it almost immediately. A quick
// skip before this window doesn't count (nor scrobble to Last.fm/ListenBrainz).
const COUNT_PLAY_AFTER_SECONDS = 5;

function maybeSubmitScrobble(status: AudioStatus) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (!isScrobblable(current)) return;
  const position = status.currentTime ?? 0;
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
      hoistAlbumToRecent(current);
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
  hoistAlbumToRecent(current);
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
// server-side "recent" and "frequent" album lists. Those back both the Home
// carousels and the home-screen widget's recent strip, so nudge React Query to
// refetch them. Debounced so a burst of skips coalesces into one refetch, and
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

// Track ids whose raw stream failed to decode on this device and have since
// been re-armed to stream through a forced server transcode. Bounded by the
// queue, and one retry per track keeps a genuinely broken source from looping.
const transcodeRetriedIds = new Set<string>();

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

// Resolve the freshest source for a track. Queue entries can become stale —
// a track enqueued before it was downloaded still holds its streamUrl, and
// vice versa. Always re-check the offline registry at load time.
function resolveTrackUrl(track: QueueTrack): {
  url: string;
  isOffline: boolean;
} {
  // Internet radio streams its own absolute URL — there's no Subsonic
  // /stream?id endpoint for it, and it's never an offline download.
  if (track.isRadio && track.url) return { url: track.url, isOffline: false };
  const downloaded = useOffline.getState().getDownloadedTrack(track.id);
  if (downloaded) return { url: downloaded.path, isOffline: true };
  if (track.source === "podcast" && track.url)
    return { url: track.url, isOffline: false };
  return {
    url: streamUrl(track.id, {
      forceTranscode: transcodeRetriedIds.has(track.id),
    }),
    isOffline: false,
  };
}

function isPlayableNow(track: QueueTrack): boolean {
  if (onlineManager.isOnline()) return true;
  return useOffline.getState().isTrackDownloaded(track.id);
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
function toLockScreenMetadata(track: QueueTrack) {
  return {
    title: track.title || undefined,
    artist: track.artist || undefined,
    albumTitle: track.album || undefined,
    artworkUrl: track.artwork || undefined,
    // Seconds → ms. Gives the media notification an authoritative duration so it
    // doesn't rely on the player's live content duration (which is unknown for
    // transcoded streams served without a length).
    durationMs:
      track.duration && track.duration > 0
        ? Math.round(track.duration * 1000)
        : undefined,
  };
}

function applyLockScreen(p: AudioPlayer, track: QueueTrack) {
  const metadata = toLockScreenMetadata(track);
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
    return;
  }
  isLoading = true;
  const { url, isOffline } = resolveTrackUrl(track);
  reportBreadcrumb("player", "load", {
    trackId: track.id,
    source: track.source,
    isOffline,
    isRadio: track.isRadio ?? false,
  });
  player.replace({ uri: url });
  player.volume = getReplayGainFactor(track);
  applyLockScreen(player, track);
  // Moving the active track off the launch track disarms resume so returning
  // to it later starts at 0 rather than its stale bookmark.
  notePlaybackTrack(track.id);
  // Resume long tracks from their saved bookmark position. Arm the seek so the
  // status listener re-applies it once the media is ready, and try an
  // immediate best-effort seek too.
  const resumeAt = getResumePosition(track);
  if (resumeAt != null) {
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

// True when the queue is parked on its final track with no repeat/shuffle — the
// point at which endless playback must extend it to keep going.
function atEndlessQueueTail(): boolean {
  const q = useQueue.getState();
  return (
    q.repeatMode === "off" &&
    !q.shuffle &&
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

function handlePlaybackStatus(status: AudioStatus) {
  // A genuine engine-level playback failure (decode error, dead stream URL,
  // unreadable offline file). expo-audio clears `error` on a fresh load /
  // successful resume, so dedupe on the message to report each failure once.
  if (status.error && status.error !== lastReportedPlaybackError) {
    lastReportedPlaybackError = status.error;
    const current = useQueue.getState().getCurrent();
    const resolved = current ? resolveTrackUrl(current) : null;
    const needsNetwork = resolved ? !resolved.isOffline : true;
    // A device that can't decode the raw source (e.g. ALAC ExoPlayer
    // advertises but fails to decode) — re-arm this track to stream through a
    // server transcode and reload it once, before treating it as a failure.
    if (
      current &&
      resolved &&
      !resolved.isOffline &&
      !current.isRadio &&
      current.source !== "podcast" &&
      isDecodeError(status.error) &&
      canTranscodeFallback() &&
      !transcodeRetriedIds.has(current.id)
    ) {
      transcodeRetriedIds.add(current.id);
      reportBreadcrumb("player", "transcode-fallback", {
        trackId: current.id,
        error: status.error,
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
    const report = () =>
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
        },
      });
    // Offline-file failures (corrupt/missing download) need no network and are
    // always real. A streamed/radio source, though, throws the same engine
    // "Source error" when the server merely blips mid-track as when the stream
    // is genuinely bad — and effective-online lags a real drop by ~24s, so
    // trusting it here over-reports transient losses the offline UI already
    // covers. Confirm the server actually answers before blaming the engine.
    if (!needsNetwork) {
      report();
    } else {
      void confirmServerReachable().then((reachable) => {
        if (reachable) report();
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
    const cur = useQueue.getState().getCurrent();
    if (cur) {
      reportNowPlaying(cur);
      recordResumePosition(cur, status.currentTime ?? 0);
    }
  } else if (wasPlaying && !status.didJustFinish && !isLoading) {
    // Playback paused (UI, lock-screen or OS control). Report it for the
    // playbackReport path; no-op when the extension is off.
    reportPaused((status.currentTime ?? 0) * 1000);
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
    if (
      !playbackReportEnabled() &&
      previousId &&
      submittedScrobbleId !== previousId &&
      previous &&
      isScrobblable(previous)
    ) {
      submittedScrobbleId = previousId;
      hoistAlbumToRecent(previous);
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
    // End of queue with no repeat/shuffle: keep the current track loaded so the
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
          player.seekTo(0);
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
  if (
    state.replayGainMode === prev.replayGainMode &&
    state.replayGainPreampDb === prev.replayGainPreampDb
  )
    return;
  const cur = useQueue.getState().getCurrent();
  if (cur) player.volume = getReplayGainFactor(cur);
});

let lastTrackId: string | null = null;
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
    lastTrackId = id;
    if (suppressAutoplayOnce) {
      suppressAutoplayOnce = false;
      resetScrobbleState();
      loadTrack(current, false);
      return;
    }
    // Jukebox mode owns playback server-side; the local player just tracks
    // metadata so the UI stays in sync.
    if (useJukebox.getState().active) {
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
  lastTrackId = null;
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
  lastTrackId = null;
  pendingResumeId = null;
  useQueue.getState().clearQueue();
}

registerLogoutHandler(stopPlayback);

export async function configurePlayback() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}

export function playTracks(
  tracks: QueueTrack[],
  startIndex = 0,
  options?: { shuffleFromRandom?: boolean; source?: QueueSource },
) {
  if (tracks.length === 0) return;
  const index =
    options?.shuffleFromRandom && useQueue.getState().shuffle
      ? Math.floor(Math.random() * tracks.length)
      : startIndex;
  const previousId = lastTrackId;
  useQueue.getState().playNow(tracks, index, options?.source ?? null);
  const current = useQueue.getState().getCurrent();
  if (current && current.id === previousId) {
    loadAndPlay(current);
  }
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
  useQueue.getState().setQueue(tracks, index);
  if (positionSeconds > 0) {
    try {
      player.seekTo(positionSeconds);
    } catch (error) {
      logSwallowed("seek to restored position", error);
    }
  }
}

// Take over playback locally from a (now stopped) jukebox session: load the
// current queue track and resume it at the position the server reached. Arms the
// pending-resume seek so it re-applies once the media is ready.
export function takeOverFromJukebox(
  positionSeconds: number,
  shouldPlay = true,
) {
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
      logSwallowed("seek to jukebox takeover position", error);
    }
  }
}

export function togglePlayPause() {
  if (useJukebox.getState().active) {
    jukeboxTogglePlayPause().catch(() => {});
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
  if (useJukebox.getState().active) {
    jukeboxPauseAction().catch(() => {});
    return;
  }
  // Persist the resume position immediately on pause rather than waiting for
  // the next throttled tick that may never come once playback stops.
  const current = useQueue.getState().getCurrent();
  if (current) {
    recordResumePosition(current, player.currentTime ?? 0, {
      force: true,
    });
  }
  player.pause();
}

registerSleepTimerPauseHandler(pause);

export function play() {
  if (useJukebox.getState().active) {
    jukeboxPlayAction().catch(() => {});
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
  if (useJukebox.getState().active) return jukeboxGetCurrentTime();
  return player.currentTime ?? 0;
}

export function isPlaying() {
  if (useJukebox.getState().active) return jukeboxIsPlaying();
  return player.playing;
}

export function skipNext() {
  const state = useQueue.getState();
  if (state.queue.length === 0 || state.currentIndex == null) return;
  if (state.repeatMode === "off" && !state.shuffle) {
    if (state.currentIndex >= state.queue.length - 1) return;
  }
  if (useJukebox.getState().active) {
    jukeboxSkipNext().catch(() => {});
    return;
  }
  state.next();
}

export function skipPrevious(options?: { force?: boolean }) {
  if (useJukebox.getState().active) {
    jukeboxSkipPrevious().catch(() => {});
    return;
  }
  if (!options?.force && player.currentTime > 3) {
    player.seekTo(0);
    return;
  }
  const queue = useQueue.getState();
  // At the start of the playback order with no repeat there is no previous
  // target — restart the current track instead of letting previous() clear the
  // queue position (which would unload it).
  const atStart =
    queue.repeatMode !== "all" &&
    (queue.shuffle && queue.shuffleOrderIds?.length
      ? (queue.shuffleCursor ?? 0) <= 0
      : (queue.currentIndex ?? 0) <= 0);
  if (atStart) {
    player.seekTo(0);
    return;
  }
  queue.previous();
}

export function seekTo(seconds: number) {
  if (useJukebox.getState().active) {
    jukeboxSeekTo(seconds).catch(() => {});
    return;
  }
  player.seekTo(seconds);
}
