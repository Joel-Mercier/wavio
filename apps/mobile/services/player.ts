import { onlineManager } from "@tanstack/react-query";
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { Platform } from "react-native";
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
import useQueue, {
  peekNextTrack,
  type QueueSource,
  type QueueTrack,
} from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";

type Slot = 0 | 1;

// Native engine calls (pause/seek/lock-screen/…) can throw while the
// underlying player is mid-teardown or the media isn't loaded yet; those
// failures are expected and safe to ignore, but surface them in dev so real
// regressions aren't silent.
function logSwallowed(label: string, error: unknown) {
  if (__DEV__) console.warn(`[player] ${label}`, error);
}

// Slot 0 is the primary playback engine and is always live. Slot 1 is only
// used for iOS preload/crossfade and the user-configurable crossfade path; it
// is created on first access to avoid the cost of a second ExoPlayer/AVPlayer
// instance for users who never trigger those paths (notably Android + gapless,
// which transitions on slot 0 via ExoPlayer's prepareNext).
const players: AudioPlayer[] = [
  createAudioPlayer(null, { updateInterval: 250 }),
];
function getPlayer(slot: Slot): AudioPlayer {
  const existing = players[slot];
  if (existing) return existing;
  const p = createAudioPlayer(null, { updateInterval: 250 });
  players[slot] = p;
  wireSlotListeners(slot, p);
  return p;
}
let activeSlot: Slot = 0;
const loadedTrackIds: (string | null)[] = [null, null];

let isLoading = false;
let playbackInitialized = false;
let endlessFetchInFlight = false;

// A resume seek can't be applied the instant a source is replaced — expo-audio
// may not have the media ready, and the bookmark map may still be loading. We
// arm the target here and (re)apply it from the status listener once the active
// player reports the track is ready, clearing it after the first application.
let pendingResumeId: string | null = null;
let pendingResumeAt = 0;

const slotListeners = new Set<() => void>();
function notifySlotChange() {
  for (const l of slotListeners) l();
}
export function getActivePlayer(): AudioPlayer {
  return players[activeSlot];
}
export function getActiveSlot(): Slot {
  return activeSlot;
}
export function subscribeActiveSlot(cb: () => void) {
  slotListeners.add(cb);
  return () => {
    slotListeners.delete(cb);
  };
}

// Backwards-compatible singleton reference. Some consumers still import this
// directly; for them, treat it as a stable handle to slot 0. New code should
// prefer getActivePlayer().
export const player = players[0];

let nowPlayingScrobbledId: string | null = null;
let submittedScrobbleId: string | null = null;
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

function maybeSubmitScrobble(status: AudioStatus) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (!isScrobblable(current)) return;
  // playbackReport path: stream progress to the server, which owns the scrobble
  // decision (and the "stopped" report on track change finalises it). Only while
  // actually playing, so a paused tick doesn't flip the server back to playing.
  if (playbackReportEnabled()) {
    if (status.playing) reportProgress((status.currentTime ?? 0) * 1000);
    return;
  }
  if (submittedScrobbleId === current.id) return;
  const position = status.currentTime ?? 0;
  const duration = status.duration ?? current.duration ?? 0;
  if (duration < 30) return;
  const halfway = duration / 2;
  if (position < Math.min(halfway, 240)) return;
  submittedScrobbleId = current.id;
  scrobble(current.id, {
    submission: true,
    time: scrobbleStartedAt ?? Date.now(),
  }).catch(() => {});
}

function resetScrobbleState() {
  // Finalise the outgoing track for the playbackReport path before clearing
  // local state. No-op when no track is being reported or the extension is off.
  reportStopped();
  nowPlayingScrobbledId = null;
  submittedScrobbleId = null;
  scrobbleStartedAt = null;
}

function getReplayGainFactor(track: QueueTrack): number {
  const { replayGainMode, replayGainPreampDb } = useAppBase.getState();
  return computeReplayGainFactor(track, replayGainMode, replayGainPreampDb);
}

function inactiveSlot(): Slot {
  return (1 - activeSlot) as Slot;
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

// Which slot currently owns the OS lock-screen / media-notification controls,
// or null when no slot does. Lets applyLockScreen pick the cheap metadata-only
// update over a full (re)activation when the same player already owns them.
let lockScreenSlot: Slot | null = null;

function applyLockScreen(p: AudioPlayer, track: QueueTrack, slot: Slot) {
  // Empty/undefined fields must be passed as undefined, not "": the native
  // expo-audio Metadata record parses `artworkUrl` into a java.net.URL, and a
  // "" (returned for local tracks without cover art) throws MalformedURLException
  // and rejects the whole call. try/catch keeps a rejected metadata update from
  // aborting playback.
  const metadata = {
    title: track.title || undefined,
    artist: track.artist || undefined,
    albumTitle: track.album || undefined,
    artworkUrl: track.artwork || undefined,
  };
  try {
    if (lockScreenSlot === slot) {
      // This player already owns the controls — refresh metadata in place.
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
      lockScreenSlot = slot;
    }
  } catch (error) {
    logSwallowed("applyLockScreen", error);
  }
}

function clearLockScreen(p: AudioPlayer, slot: Slot) {
  try {
    p.clearLockScreenControls();
  } catch (error) {
    logSwallowed("clearLockScreenControls", error);
  }
  if (lockScreenSlot === slot) lockScreenSlot = null;
}

type Transition =
  | { kind: "idle" }
  | { kind: "preloaded"; trackId: string }
  // Android-only. The next source has been queued on the active player's
  // ExoPlayer timeline via prepareNext(); ExoPlayer will auto-advance into it
  // gaplessly when the current source ends.
  | { kind: "queued"; trackId: string }
  | {
      kind: "crossfading";
      nextTrackId: string;
      rampTimer: ReturnType<typeof setInterval>;
      startedAt: number;
      durationMs: number;
      outFactor: number;
      inFactor: number;
      outSlot: Slot;
      inSlot: Slot;
    };

let transition: Transition = { kind: "idle" };
// Module-scoped handle so the ramp timer can always be cleared even if
// `transition` is overwritten through an unexpected code path.
let activeRampTimer: ReturnType<typeof setInterval> | null = null;
function clearRampTimer() {
  if (activeRampTimer != null) {
    clearInterval(activeRampTimer);
    activeRampTimer = null;
  }
}
// When set, the queue subscription should skip the next change because the
// transition machinery has already promoted the new track on the active
// player.
let expectedNextTrackId: string | null = null;

function loadTrack(slot: Slot, track: QueueTrack | null, autoplay: boolean) {
  const p = players[slot];
  if (!track) {
    p.pause();
    clearLockScreen(p, slot);
    loadedTrackIds[slot] = null;
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
  p.replace({ uri: url });
  p.volume = getReplayGainFactor(track);
  if (slot === activeSlot) {
    applyLockScreen(p, track, slot);
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
        p.seekTo(resumeAt);
      } catch (error) {
        logSwallowed("resume seek on load", error);
      }
    } else {
      pendingResumeId = null;
    }
  }
  if (autoplay) {
    p.play();
    reportNowPlaying(track);
    playbackInitialized = true;
  }
  loadedTrackIds[slot] = track.id;
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
    players[activeSlot].pause();
    clearLockScreen(players[activeSlot], activeSlot);
    loadedTrackIds[activeSlot] = null;
    return;
  }
  loadTrack(activeSlot, track, true);
}

function abortTransition() {
  clearRampTimer();
  if (transition.kind === "queued") {
    // Android: clear the queued item from the active player's ExoPlayer
    // timeline. The inactive slot was never used in this path.
    if (Platform.OS === "android") {
      try {
        players[activeSlot].clearPreparedNext();
      } catch (error) {
        logSwallowed("clearPreparedNext", error);
      }
    }
    transition = { kind: "idle" };
    expectedNextTrackId = null;
    return;
  }
  // The inactive slot is the one carrying the pending track during any
  // transition. Silence it and reset.
  const inactive = players[inactiveSlot()];
  try {
    inactive.pause();
  } catch (error) {
    logSwallowed("pause inactive slot on abort", error);
  }
  inactive.volume = 0;
  // Restore active to its natural ReplayGain factor.
  const current = useQueue.getState().getCurrent();
  if (current) players[activeSlot].volume = getReplayGainFactor(current);
  transition = { kind: "idle" };
  expectedNextTrackId = null;
}

function preloadNext() {
  const next = peekNextTrack();
  if (!next) return;
  if (!isPlayableNow(next)) return;
  const cur = useQueue.getState().getCurrent();
  // Repeat-one would attempt to load the same source on the inactive player;
  // a single-player restart on didJustFinish handles this case fine.
  if (cur && next.id === cur.id) return;
  if (Platform.OS === "android") {
    // True gapless: queue the next source on the active player's ExoPlayer
    // timeline. ExoPlayer pre-buffers and transitions seamlessly, firing
    // `nextTrackStarted` when the boundary is crossed.
    const { url } = resolveTrackUrl(next);
    players[activeSlot].prepareNext({ uri: url });
    transition = { kind: "queued", trackId: next.id };
    return;
  }
  // iOS fallback: preload on the inactive slot. The status listener will
  // start a short crossfade at the boundary to mask the AVPlayer swap gap.
  const slot = inactiveSlot();
  if (loadedTrackIds[slot] === next.id) {
    transition = { kind: "preloaded", trackId: next.id };
    return;
  }
  const p = getPlayer(slot);
  const { url } = resolveTrackUrl(next);
  p.replace({ uri: url });
  p.volume = 0;
  loadedTrackIds[slot] = next.id;
  transition = { kind: "preloaded", trackId: next.id };
}

function startCrossfade(durationSeconds: number) {
  // Drop any in-flight gapless preload/queue first so the active player's
  // ExoPlayer timeline doesn't also auto-advance into the next track while the
  // fade plays it on the other slot. No-op on the common idle entry.
  if (transition.kind !== "idle") abortTransition();
  const next = peekNextTrack();
  if (!next) return;
  if (!isPlayableNow(next)) return;
  const cur = useQueue.getState().getCurrent();
  if (cur && next.id === cur.id) return;
  const inSlot = inactiveSlot();
  const outSlot = activeSlot;
  const incoming = getPlayer(inSlot);
  const outgoing = players[outSlot];
  if (loadedTrackIds[inSlot] !== next.id) {
    const { url } = resolveTrackUrl(next);
    incoming.replace({ uri: url });
    loadedTrackIds[inSlot] = next.id;
  }
  const inFactor = getReplayGainFactor(next);
  const outFactor = cur ? getReplayGainFactor(cur) : 1;
  incoming.volume = 0;
  incoming.play();
  reportNowPlaying(next);
  // Move lock-screen ownership to the incoming track immediately so that
  // notification metadata reflects what's becoming dominant. Activating the
  // incoming slot transfers ownership natively (deactivating the outgoing
  // player); an explicit clear here would only force a STOP_FOREGROUND_REMOVE
  // teardown of the notification.
  applyLockScreen(incoming, next, inSlot);
  // Promote active early so external consumers (status hooks, controls) start
  // tracking the incoming track.
  activeSlot = inSlot;
  notifySlotChange();
  // The queue index hasn't moved yet; tell the queue subscription to ignore
  // the upcoming next() call.
  expectedNextTrackId = next.id;

  const startedAt = Date.now();
  const durationMs =
    Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds * 1000
      : 0;
  const stepMs = 50;
  // Hard ceiling so a clock jump or zero duration can't keep the timer alive
  // past the intended fade window.
  const maxTicks = Math.ceil(durationMs / stepMs) + 20;
  let ticks = 0;

  // Defensive: if a prior timer is somehow still live, drop it before we
  // install a new one.
  clearRampTimer();
  const rampTimer = setInterval(() => {
    ticks += 1;
    if (transition.kind !== "crossfading" || ticks > maxTicks) {
      clearRampTimer();
      if (transition.kind === "crossfading") finishCrossfade();
      return;
    }
    const elapsed = Date.now() - startedAt;
    const t =
      durationMs > 0 ? Math.min(1, Math.max(0, elapsed / durationMs)) : 1;
    outgoing.volume = transition.outFactor * (1 - t);
    incoming.volume = transition.inFactor * t;
    if (t >= 1) finishCrossfade();
  }, stepMs);
  activeRampTimer = rampTimer;

  transition = {
    kind: "crossfading",
    nextTrackId: next.id,
    rampTimer,
    startedAt,
    durationMs,
    outFactor,
    inFactor,
    outSlot,
    inSlot,
  };
}

function finishCrossfade() {
  if (transition.kind !== "crossfading") return;
  clearRampTimer();
  const { outSlot, inFactor } = transition;
  try {
    players[outSlot].pause();
  } catch (error) {
    logSwallowed("pause outgoing slot on crossfade end", error);
  }
  players[outSlot].volume = 0;
  loadedTrackIds[outSlot] = null;
  players[activeSlot].volume = inFactor;
  transition = { kind: "idle" };
  // Advance queue to keep state in sync with the newly active track.
  useQueue.getState().next();
}

const remoteListeners: ReturnType<AudioPlayer["addListener"]>[] = [];
const statusListeners: ReturnType<AudioPlayer["addListener"]>[] = [];

// Android-only. Fires when ExoPlayer auto-advances from the current item to
// the item queued via prepareNext(). The new track is already audible on the
// same player; we only need to sync queue/scrobble/lockscreen state.
function handleNextTrackStarted() {
  if (transition.kind !== "queued") return;
  const queuedId = transition.trackId;
  const next = peekNextTrack();
  if (!next) {
    transition = { kind: "idle" };
    return;
  }
  if (next.id !== queuedId) {
    // The queue changed after prepareNext(): ExoPlayer advanced into a stale
    // source. Advance the queue and let the subscription load the real next
    // track on the active player.
    transition = { kind: "idle" };
    useQueue.getState().next();
    return;
  }
  resetScrobbleState();
  reportNowPlaying(next);
  players[activeSlot].volume = getReplayGainFactor(next);
  applyLockScreen(players[activeSlot], next, activeSlot);
  loadedTrackIds[activeSlot] = next.id;
  // The queue subscription will see the new currentIndex from useQueue.next()
  // below — tell it to ignore that change since the player is already playing
  // the new track.
  expectedNextTrackId = next.id;
  transition = { kind: "idle" };
  useQueue.getState().next();
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

function makeStatusListener(slot: Slot) {
  return (status: AudioStatus) => {
    if (slot !== activeSlot) return;
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
        loadTrack(activeSlot, current, true);
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
      if (
        cur?.id === pendingResumeId &&
        loadedTrackIds[activeSlot] === pendingResumeId
      ) {
        const target = pendingResumeAt;
        pendingResumeId = null;
        if (Math.abs((status.currentTime ?? 0) - target) > 1.5) {
          try {
            players[activeSlot].seekTo(target);
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

    if (
      status.duration > 0 &&
      transition.kind !== "crossfading" &&
      !isLoading
    ) {
      const { crossfadeSeconds, gaplessEnabled } = useAppBase.getState();
      const remaining = status.duration - status.currentTime;
      if (crossfadeSeconds > 0) {
        // User-configured crossfade owns the boundary exclusively. Gapless
        // preload is skipped here so the active player doesn't also queue the
        // next track and hand off to it behind the fade (the two arm in the
        // same window since crossfade maxes out below the 15s gapless lead).
        if (remaining > 0 && remaining <= crossfadeSeconds) {
          startCrossfade(crossfadeSeconds);
        }
      } else if (gaplessEnabled && remaining > 0 && remaining <= 15) {
        if (transition.kind === "idle") {
          preloadNext();
        } else if (
          Platform.OS !== "android" &&
          remaining <= 0.6 &&
          transition.kind === "preloaded"
        ) {
          // iOS only — Android handles the boundary natively via ExoPlayer.
          startCrossfade(0.5);
        }
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
        scrobble(previousId, {
          submission: true,
          time: scrobbleStartedAt ?? Date.now(),
        }).catch(() => {});
      }
      if (consumeSleepEndOfTrack()) {
        if (transition.kind !== "idle") abortTransition();
        players[activeSlot].pause();
        return;
      }
      if (transition.kind === "crossfading") {
        // Outgoing finished mid-fade — the incoming player is already active
        // and audible; just complete the bookkeeping.
        finishCrossfade();
        return;
      }
      if (transition.kind === "preloaded") {
        const slot = inactiveSlot();
        const next = peekNextTrack();
        if (next && loadedTrackIds[slot] === next.id) {
          activeSlot = slot;
          notifySlotChange();
          const factor = getReplayGainFactor(next);
          players[activeSlot].volume = factor;
          applyLockScreen(players[activeSlot], next, activeSlot);
          players[activeSlot].play();
          resetScrobbleState();
          reportNowPlaying(next);
          loadedTrackIds[inactiveSlot()] = null;
          expectedNextTrackId = next.id;
          transition = { kind: "idle" };
          useQueue.getState().next();
          return;
        }
        transition = { kind: "idle" };
      }
      // End of queue with no repeat/shuffle: keep the current track loaded so
      // the player UI keeps its title/artist/cover, just stop playback. If
      // endless playback is enabled, fetch similar tracks and append them so
      // playback continues without disturbing the original queue.
      const qstate = useQueue.getState();
      if (
        qstate.repeatMode === "off" &&
        !qstate.shuffle &&
        qstate.currentIndex != null &&
        qstate.currentIndex >= qstate.queue.length - 1
      ) {
        const endless = useAppBase.getState().endlessPlaybackEnabled;
        const seed = qstate.getCurrent();
        if (!endless || !seed || endlessFetchInFlight) {
          try {
            players[activeSlot].pause();
            players[activeSlot].seekTo(0);
          } catch (error) {
            logSwallowed("stop at queue end", error);
          }
          return;
        }
        endlessFetchInFlight = true;
        try {
          players[activeSlot].pause();
        } catch (error) {
          logSwallowed("pause before endless fetch", error);
        }
        fetchEndlessExtension(seed)
          .then((tracks) => {
            if (tracks.length === 0) {
              try {
                players[activeSlot].seekTo(0);
              } catch (error) {
                logSwallowed("rewind after empty endless fetch", error);
              }
              return;
            }
            useQueue.getState().enqueueEnd(tracks);
            useQueue.getState().next();
            // The queue subscription loads the new track on the id change; only
            // load explicitly when the id didn't change (so it never fired).
            const c = useQueue.getState().getCurrent();
            if (c && c.id === previousId) loadAndPlay(c);
          })
          .catch((error) => {
            reportError(error, {
              area: "player",
              endpoint: "endlessRadio",
              extra: { seedId: seed.id, source: seed.source },
            });
            try {
              players[activeSlot].seekTo(0);
            } catch (rewindError) {
              logSwallowed("rewind after failed endless fetch", rewindError);
            }
          })
          .finally(() => {
            endlessFetchInFlight = false;
          });
        return;
      }
      // Default path: advance queue and load on active.
      useQueue.getState().next();
      const c = useQueue.getState().getCurrent();
      if (!c) {
        players[activeSlot].pause();
        clearLockScreen(players[activeSlot], activeSlot);
        return;
      }
      if (c.id === previousId) {
        loadAndPlay(c);
      }
    }
  };
}

function wireSlotListeners(slot: Slot, p: AudioPlayer) {
  remoteListeners.push(
    p.addListener("remotePrevious", () => {
      if (slot !== activeSlot) return;
      skipPrevious();
    }),
  );
  remoteListeners.push(
    p.addListener("remoteNext", () => {
      if (slot !== activeSlot) return;
      skipNext();
    }),
  );
  if (Platform.OS === "android") {
    remoteListeners.push(
      p.addListener("nextTrackStarted", () => {
        if (slot !== activeSlot) return;
        handleNextTrackStarted();
      }),
    );
  }
  statusListeners.push(
    p.addListener("playbackStatusUpdate", makeStatusListener(slot)),
  );
}

wireSlotListeners(0, players[0]);

const appUnsub = useAppBase.subscribe((state, prev) => {
  if (
    state.replayGainMode === prev.replayGainMode &&
    state.replayGainPreampDb === prev.replayGainPreampDb
  )
    return;
  if (transition.kind === "crossfading") {
    const cur = useQueue.getState().getCurrent();
    if (cur) transition.outFactor = getReplayGainFactor(cur);
    const next = peekNextTrack();
    if (next) transition.inFactor = getReplayGainFactor(next);
    return;
  }
  const cur = useQueue.getState().getCurrent();
  if (cur) players[activeSlot].volume = getReplayGainFactor(cur);
});

let lastTrackId: string | null = null;
let hasHydrated = false;
// When restoring a queue saved on the server, we want the same "load but don't
// auto-play" behaviour as cold-start hydration. This flag tells the next queue
// subscription firing to load silently.
let suppressAutoplayOnce = false;
const queueUnsub = useQueue.subscribe((state) => {
  // A queue edit (play-next insert, removal, reorder) can invalidate a source
  // already queued on ExoPlayer's timeline via prepareNext(). Drop it — the
  // status listener re-arms the preload on its next tick if still in window.
  if (transition.kind === "queued") {
    const upcoming = peekNextTrack();
    if (upcoming?.id !== transition.trackId) abortTransition();
  }
  const current =
    state.currentIndex != null ? state.queue[state.currentIndex] : null;
  const id = current?.id ?? null;
  if (id !== lastTrackId) {
    lastTrackId = id;
    if (expectedNextTrackId && expectedNextTrackId === id) {
      expectedNextTrackId = null;
      return;
    }
    if (suppressAutoplayOnce) {
      suppressAutoplayOnce = false;
      if (transition.kind !== "idle") abortTransition();
      resetScrobbleState();
      loadTrack(activeSlot, current, false);
      return;
    }
    // Jukebox mode owns playback server-side; the local player just tracks
    // metadata so the UI stays in sync.
    if (useJukebox.getState().active) {
      if (transition.kind !== "idle") abortTransition();
      resetScrobbleState();
      return;
    }
    if (!hasHydrated) {
      // Persist rehydration emits a state change before onFinishHydration
      // fires; load the restored track silently so reopening the app does
      // not auto-resume playback.
      if (transition.kind !== "idle") abortTransition();
      resetScrobbleState();
      loadTrack(activeSlot, current, false);
      return;
    }
    if (transition.kind !== "idle") abortTransition();
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
    try {
      clearRampTimer();
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
    for (const p of players) {
      if (!p) continue;
      try {
        p.pause();
      } catch {}
      try {
        p.remove();
      } catch {}
    }
  });
}

function hydratePlayerFromQueue() {
  const current = useQueue.getState().getCurrent();
  lastTrackId = current?.id ?? null;
  // The restored current track is the only one eligible to resume from its saved
  // position; arm before loading so the resume read below honours it.
  armResume(current?.id ?? null);
  if (current && loadedTrackIds[activeSlot] !== current.id) {
    loadTrack(activeSlot, current, false);
  }
  hasHydrated = true;
  // Bookmarks load asynchronously, so the loadTrack above usually runs before
  // the resume map is populated. Once it lands, arm the resume seek for the
  // restored (and not-yet-played) track so reopening the app lands at the saved
  // position instead of the start.
  if (current && !playbackInitialized) {
    void loadResumePositions().then(() => {
      if (loadedTrackIds[activeSlot] !== current.id) return;
      if (playbackInitialized || players[activeSlot].playing) return;
      const resumeAt = getResumePosition(current);
      if (resumeAt == null) return;
      pendingResumeId = current.id;
      pendingResumeAt = resumeAt;
      try {
        players[activeSlot].seekTo(resumeAt);
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
  if (transition.kind !== "idle") abortTransition();
  resetScrobbleState();
  try {
    players[activeSlot].pause();
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

// Fully stop and unload playback on logout: halt any crossfade, stop server
// queue sync, silence both engine slots and clear their lock-screen / now-
// playing controls, reset transient playback state, then empty the queue. The
// engine instances themselves stay alive so a subsequent login can reuse them.
export function stopPlayback() {
  if (transition.kind !== "idle") abortTransition();
  stopPlayQueueSync();
  resetScrobbleState();
  for (let slot = 0; slot < players.length; slot++) {
    if (!players[slot]) continue;
    try {
      loadTrack(slot as Slot, null, false);
    } catch (error) {
      logSwallowed("stop playback", error);
    }
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
  if (transition.kind !== "idle") abortTransition();
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
  if (transition.kind !== "idle") abortTransition();
  suppressAutoplayOnce = true;
  playbackInitialized = false;
  useQueue.getState().setQueue(tracks, index);
  if (positionSeconds > 0) {
    try {
      players[activeSlot].seekTo(positionSeconds);
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
  if (transition.kind !== "idle") abortTransition();
  if (shouldPlay) {
    loadAndPlay(current);
  } else {
    loadTrack(activeSlot, current, false);
  }
  const pos = Math.max(0, Math.floor(positionSeconds));
  if (pos > 0) {
    pendingResumeId = current.id;
    pendingResumeAt = pos;
    try {
      players[activeSlot].seekTo(pos);
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
  const active = players[activeSlot];
  if (active.playing) {
    active.pause();
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackIds[activeSlot] !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  active.play();
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
    recordResumePosition(current, players[activeSlot].currentTime ?? 0, {
      force: true,
    });
  }
  players[activeSlot].pause();
}

registerSleepTimerPauseHandler(pause);

export function play() {
  if (useJukebox.getState().active) {
    jukeboxPlayAction().catch(() => {});
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackIds[activeSlot] !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  players[activeSlot].play();
}

export function getCurrentTime() {
  if (useJukebox.getState().active) return jukeboxGetCurrentTime();
  return players[activeSlot].currentTime ?? 0;
}

export function isPlaying() {
  if (useJukebox.getState().active) return jukeboxIsPlaying();
  return players[activeSlot].playing;
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
  if (transition.kind !== "idle") abortTransition();
  state.next();
}

export function skipPrevious(options?: { force?: boolean }) {
  if (useJukebox.getState().active) {
    jukeboxSkipPrevious().catch(() => {});
    return;
  }
  const active = players[activeSlot];
  if (!options?.force && active.currentTime > 3) {
    active.seekTo(0);
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
    active.seekTo(0);
    return;
  }
  if (transition.kind !== "idle") abortTransition();
  queue.previous();
}

export function seekTo(seconds: number) {
  if (useJukebox.getState().active) {
    jukeboxSeekTo(seconds).catch(() => {});
    return;
  }
  players[activeSlot].seekTo(seconds);
}
