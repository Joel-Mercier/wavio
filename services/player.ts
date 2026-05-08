import {
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { scrobble } from "@/services/openSubsonic/mediaAnnotation";
import { consumeSleepEndOfTrack } from "@/services/sleepTimer";
import { useAppBase } from "@/stores/app";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";

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
  p.replace({ uri: track.url });
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
  loadTrack(activeSlot, track, true);
}

function abortTransition() {
  if (transition.kind === "crossfading") {
    clearInterval(transition.rampTimer);
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
  p.replace({ uri: next.url });
  p.volume = 0;
  loadedTrackIds[slot] = next.id;
  transition = { kind: "preloaded", trackId: next.id };
}

function startCrossfade(durationSeconds: number) {
  const next = peekNextTrack();
  if (!next) return;
  const cur = useQueue.getState().getCurrent();
  if (cur && next.id === cur.id) return;
  const inSlot = inactiveSlot();
  const outSlot = activeSlot;
  const incoming = players[inSlot];
  const outgoing = players[outSlot];
  if (loadedTrackIds[inSlot] !== next.id) {
    incoming.replace({ uri: next.url });
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
  const durationMs = durationSeconds * 1000;
  const stepMs = 50;

  const rampTimer = setInterval(() => {
    if (transition.kind !== "crossfading") {
      clearInterval(rampTimer);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const t = Math.min(1, elapsed / durationMs);
    outgoing.volume = transition.outFactor * (1 - t);
    incoming.volume = transition.inFactor * t;
    if (t >= 1) finishCrossfade();
  }, stepMs);

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
  clearInterval(transition.rampTimer);
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
    if (transition.kind === "crossfading") {
      try {
        clearInterval(transition.rampTimer);
      } catch {}
    }
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
  if (current) {
    loadTrack(activeSlot, current, false);
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
