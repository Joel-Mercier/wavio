import { onlineManager } from "@tanstack/react-query";
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { Platform } from "react-native";
import { scrobble } from "@/services/backend/mediaAnnotation";
import { fetchEndlessExtension } from "@/services/endlessRadio";
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
import useJukebox from "@/stores/jukebox";
import useOffline from "@/stores/offline";
import useQueue, { getQueueIndexById, type QueueTrack } from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";
import { streamUrl } from "@/utils/streaming";

type Slot = 0 | 1;

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

function isScrobblable(track: QueueTrack): boolean {
  return track.source !== "podcast";
}

function reportNowPlaying(track: QueueTrack) {
  if (nowPlayingScrobbledId === track.id) return;
  nowPlayingScrobbledId = track.id;
  scrobbleStartedAt = Date.now();
  if (!isScrobblable(track)) return;
  scrobble(track.id, { submission: false }).catch(() => {});
}

function maybeSubmitScrobble(status: AudioStatus) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (submittedScrobbleId === current.id) return;
  if (!isScrobblable(current)) return;
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
  return { url: streamUrl(track.id), isOffline: false };
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

function applyLockScreen(p: AudioPlayer, track: QueueTrack) {
  p.setActiveForLockScreen(
    true,
    {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
      artworkUrl: track.artwork,
    },
    {
      showSeekBackward: true,
      showSeekForward: true,
      showSkipPrevious: true,
      showSkipNext: true,
    },
  );
}

function clearLockScreen(p: AudioPlayer) {
  try {
    p.clearLockScreenControls();
  } catch {}
}

// Compute the next track in playback order without mutating the queue.
// Mirrors the simple cases of useQueue.next(); returns null when shuffle would
// regenerate (we don't preload across order regeneration to avoid surprises).
function peekNextTrack(): QueueTrack | null {
  const s = useQueue.getState();
  if (s.queue.length === 0 || s.currentIndex == null) return null;
  if (s.repeatMode === "one") return s.queue[s.currentIndex];
  if (s.shuffle && s.shuffleOrderIds && s.shuffleOrderIds.length > 0) {
    const cursor = s.shuffleCursor ?? -1;
    const nextCursor = cursor + 1;
    if (nextCursor < s.shuffleOrderIds.length) {
      const id = s.shuffleOrderIds[nextCursor];
      const idx = getQueueIndexById(id);
      return idx >= 0 ? s.queue[idx] : null;
    }
    return null;
  }
  if (s.currentIndex + 1 < s.queue.length) return s.queue[s.currentIndex + 1];
  if (s.repeatMode === "all" && s.queue.length > 0) return s.queue[0];
  return null;
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
    clearLockScreen(p);
    loadedTrackIds[slot] = null;
    return;
  }
  isLoading = true;
  const { url } = resolveTrackUrl(track);
  p.replace({ uri: url });
  p.volume = getReplayGainFactor(track);
  if (slot === activeSlot) {
    applyLockScreen(p, track);
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
      } catch {}
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
    clearLockScreen(players[activeSlot]);
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
      } catch {}
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
  } catch {}
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
  // notification metadata reflects what's becoming dominant.
  clearLockScreen(outgoing);
  applyLockScreen(incoming, next);
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
  } catch {}
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
  const next = peekNextTrack();
  if (!next) {
    transition = { kind: "idle" };
    return;
  }
  resetScrobbleState();
  reportNowPlaying(next);
  players[activeSlot].volume = getReplayGainFactor(next);
  applyLockScreen(players[activeSlot], next);
  loadedTrackIds[activeSlot] = next.id;
  // The queue subscription will see the new currentIndex from useQueue.next()
  // below — tell it to ignore that change since the player is already playing
  // the new track.
  expectedNextTrackId = next.id;
  transition = { kind: "idle" };
  useQueue.getState().next();
}

function makeStatusListener(slot: Slot) {
  return (status: AudioStatus) => {
    if (slot !== activeSlot) return;
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
          } catch {}
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
    }
    maybeSubmitScrobble(status);

    if (
      status.duration > 0 &&
      transition.kind !== "crossfading" &&
      !isLoading
    ) {
      const { crossfadeSeconds, gaplessEnabled } = useAppBase.getState();
      const remaining = status.duration - status.currentTime;
      if (
        crossfadeSeconds > 0 &&
        remaining > 0 &&
        remaining <= crossfadeSeconds
      ) {
        startCrossfade(crossfadeSeconds);
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
          clearLockScreen(players[activeSlot]);
          activeSlot = slot;
          notifySlotChange();
          const factor = getReplayGainFactor(next);
          players[activeSlot].volume = factor;
          applyLockScreen(players[activeSlot], next);
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
          } catch {}
          return;
        }
        endlessFetchInFlight = true;
        try {
          players[activeSlot].pause();
        } catch {}
        fetchEndlessExtension(seed)
          .then((tracks) => {
            if (tracks.length === 0) {
              try {
                players[activeSlot].seekTo(0);
              } catch {}
              return;
            }
            useQueue.getState().enqueueEnd(tracks);
            useQueue.getState().next();
            const c = useQueue.getState().getCurrent();
            if (c) loadAndPlay(c);
          })
          .catch(() => {
            try {
              players[activeSlot].seekTo(0);
            } catch {}
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
        clearLockScreen(players[activeSlot]);
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
      } catch {}
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

export async function configurePlayback() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}

export function playTracks(tracks: QueueTrack[], startIndex = 0) {
  if (tracks.length === 0) return;
  if (transition.kind !== "idle") abortTransition();
  const previousId = lastTrackId;
  useQueue.getState().playNow(tracks, startIndex);
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
    } catch {}
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
  if (transition.kind !== "idle") abortTransition();
  const queue = useQueue.getState();
  const previousIndex =
    queue.currentIndex != null ? queue.currentIndex - 1 : -1;
  if (previousIndex >= 0) {
    queue.setCurrentIndex(previousIndex);
  } else if (queue.repeatMode === "all" && queue.queue.length > 0) {
    queue.setCurrentIndex(queue.queue.length - 1);
  } else {
    active.seekTo(0);
  }
}

export function seekTo(seconds: number) {
  if (useJukebox.getState().active) {
    jukeboxSeekTo(seconds).catch(() => {});
    return;
  }
  players[activeSlot].seekTo(seconds);
}
