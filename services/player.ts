import { onlineManager } from "@tanstack/react-query";
import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { scrobble } from "@/services/openSubsonic/mediaAnnotation";
import {
  consumeSleepEndOfTrack,
  registerSleepTimerPauseHandler,
} from "@/services/sleepTimer";
import { useAppBase } from "@/stores/app";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";
import { streamUrl } from "@/utils/streaming";

type Slot = 0 | 1;

const players: AudioPlayer[] = [
  createAudioPlayer(null, { updateInterval: 250 }),
  createAudioPlayer(null, { updateInterval: 250 }),
];
let activeSlot: Slot = 0;
const loadedTrackIds: (string | null)[] = [null, null];

let isLoading = false;
let playbackInitialized = false;

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

function reportNowPlaying(track: QueueTrack) {
  if (nowPlayingScrobbledId === track.id) return;
  nowPlayingScrobbledId = track.id;
  scrobbleStartedAt = Date.now();
  scrobble(track.id, { submission: false }).catch(() => {});
}

function maybeSubmitScrobble(status: AudioStatus) {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
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
  const downloaded = useOffline.getState().getDownloadedTrack(track.id);
  if (downloaded) return { url: downloaded.path, isOffline: true };
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
      const idx = s.queue.findIndex((t) => t.id === id);
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
  if (slot === activeSlot) applyLockScreen(p, track);
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
  const slot = inactiveSlot();
  if (loadedTrackIds[slot] === next.id) {
    transition = { kind: "preloaded", trackId: next.id };
    return;
  }
  const p = players[slot];
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
  const incoming = players[inSlot];
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

function makeStatusListener(slot: Slot) {
  return (status: AudioStatus) => {
    if (slot !== activeSlot) return;
    if (status.playing) {
      const cur = useQueue.getState().getCurrent();
      if (cur) reportNowPlaying(cur);
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
      } else if (
        gaplessEnabled &&
        transition.kind === "idle" &&
        remaining > 0 &&
        remaining <= 5
      ) {
        preloadNext();
      }
    }

    if (status.didJustFinish && !isLoading) {
      const previousId = useQueue.getState().getCurrent()?.id ?? null;
      if (previousId && submittedScrobbleId !== previousId) {
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
      // the player UI keeps its title/artist/cover, just stop playback.
      const qstate = useQueue.getState();
      if (
        qstate.repeatMode === "off" &&
        !qstate.shuffle &&
        qstate.currentIndex != null &&
        qstate.currentIndex >= qstate.queue.length - 1
      ) {
        try {
          players[activeSlot].pause();
          players[activeSlot].seekTo(0);
        } catch {}
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

for (const slot of [0, 1] as const) {
  const p = players[slot];
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
  statusListeners.push(
    p.addListener("playbackStatusUpdate", makeStatusListener(slot)),
  );
}

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
  if (current && loadedTrackIds[activeSlot] !== current.id) {
    loadTrack(activeSlot, current, false);
  }
  hasHydrated = true;
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

export function togglePlayPause() {
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
  players[activeSlot].pause();
}

registerSleepTimerPauseHandler(pause);

export function play() {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackIds[activeSlot] !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  players[activeSlot].play();
}

export function getCurrentTime() {
  return players[activeSlot].currentTime ?? 0;
}

export function isPlaying() {
  return players[activeSlot].playing;
}

export function skipNext() {
  const state = useQueue.getState();
  if (state.queue.length === 0 || state.currentIndex == null) return;
  if (state.repeatMode === "off" && !state.shuffle) {
    if (state.currentIndex >= state.queue.length - 1) return;
  }
  if (transition.kind !== "idle") abortTransition();
  state.next();
}

export function skipPrevious(options?: { force?: boolean }) {
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
  players[activeSlot].seekTo(seconds);
}
