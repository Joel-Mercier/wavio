import {
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import { scrobble } from "@/services/openSubsonic/mediaAnnotation";
import { consumeSleepEndOfTrack } from "@/services/sleepTimer";
import { useAppBase } from "@/stores/app";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { computeReplayGainFactor } from "@/utils/replayGain";

export const player = createAudioPlayer(null, { updateInterval: 1000 });

let isLoading = false;
let loadedTrackId: string | null = null;
// True only after a track has been loaded with autoplay (i.e. playback was
// actually started by user action). The hydration path pre-loads the queue's
// current track so the FloatingPlayer has metadata to render, but the native
// source isn't guaranteed to be ready until play() is invoked alongside
// replace(). Without this flag, tapping play after a fresh app start would
// short-circuit to player.play() on an unloaded source and do nothing.
let playbackInitialized = false;

// Scrobble bookkeeping. Navidrome (and the OpenSubsonic spec) expects two
// distinct calls per playback: a "now playing" notification on start
// (submission=false) and a play registration once the track has been
// listened to long enough (submission=true). Without the latter, sections
// like "recently played" never refresh.
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
  // Last.fm / Navidrome convention: count as a play after 50% or 4 minutes,
  // whichever comes first. Require at least ~30s of audio to be eligible.
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

function applyReplayGain(track: QueueTrack) {
  const { replayGainMode, replayGainPreampDb } = useAppBase.getState();
  const factor = computeReplayGainFactor(
    track,
    replayGainMode,
    replayGainPreampDb,
  );
  console.log("[replayGain]", {
    trackId: track.id,
    title: track.title,
    mode: replayGainMode,
    preampDb: replayGainPreampDb,
    tags: track.replayGain ?? null,
    factor,
    volumeDb: factor > 0 ? 20 * Math.log10(factor) : -Infinity,
  });
  player.volume = factor;
}

function loadTrack(track: QueueTrack | null, autoplay: boolean) {
  resetScrobbleState();
  if (!track) {
    player.pause();
    player.clearLockScreenControls();
    loadedTrackId = null;
    return;
  }
  isLoading = true;
  player.replace({ uri: track.url });
  applyReplayGain(track);
  player.setActiveForLockScreen(
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
  if (autoplay) {
    player.play();
    reportNowPlaying(track);
    playbackInitialized = true;
  }
  loadedTrackId = track.id;
  isLoading = false;
}

function loadAndPlay(track: QueueTrack | null) {
  loadTrack(track, true);
}

const remotePreviousSub = player.addListener("remotePrevious", () => {
  skipPrevious();
});

const remoteNextSub = player.addListener("remoteNext", () => {
  skipNext();
});

const statusSub = player.addListener(
  "playbackStatusUpdate",
  (status: AudioStatus) => {
    if (status.playing) {
      const current = useQueue.getState().getCurrent();
      if (current) reportNowPlaying(current);
    }
    maybeSubmitScrobble(status);
    if (status.didJustFinish && !isLoading) {
      const previousId = useQueue.getState().getCurrent()?.id ?? null;
      // Ensure a play is registered for tracks that finish before the
      // threshold check fires (very short tracks).
      if (previousId && submittedScrobbleId !== previousId) {
        submittedScrobbleId = previousId;
        scrobble(previousId, {
          submission: true,
          time: scrobbleStartedAt ?? Date.now(),
        }).catch(() => {});
      }
      if (consumeSleepEndOfTrack()) {
        player.pause();
        return;
      }
      useQueue.getState().next();
      const current = useQueue.getState().getCurrent();
      if (!current) {
        player.pause();
        player.clearLockScreenControls();
        return;
      }
      // Subscriber handles id-change. If the id is unchanged (repeat-one),
      // restart playback explicitly.
      if (current.id === previousId) {
        loadAndPlay(current);
      }
    }
  },
);

const appUnsub = useAppBase.subscribe((state, prev) => {
  if (
    state.replayGainMode === prev.replayGainMode &&
    state.replayGainPreampDb === prev.replayGainPreampDb
  )
    return;
  const current = useQueue.getState().getCurrent();
  if (current) applyReplayGain(current);
});

let lastTrackId: string | null = null;
const queueUnsub = useQueue.subscribe((state) => {
  const current =
    state.currentIndex != null ? state.queue[state.currentIndex] : null;
  const id = current?.id ?? null;
  if (id !== lastTrackId) {
    lastTrackId = id;
    loadAndPlay(current);
  }
});

// Fast Refresh / HMR cleanup: release the native player and listeners so we
// don't end up with multiple AudioPlayer instances after every code change.
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
      statusSub?.remove?.();
    } catch {}
    try {
      remotePreviousSub?.remove?.();
    } catch {}
    try {
      remoteNextSub?.remove?.();
    } catch {}
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
  if (current) {
    loadTrack(current, false);
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
  const previousId = lastTrackId;
  useQueue.getState().playNow(tracks, startIndex);
  // Subscriber handles new-id case. If the new current id matches what was
  // already playing, force a reload to restart from the top.
  const current = useQueue.getState().getCurrent();
  if (current && current.id === previousId) {
    loadAndPlay(current);
  }
}

export function togglePlayPause() {
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
  player.pause();
}

export function play() {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  if (loadedTrackId !== current.id || !playbackInitialized) {
    loadAndPlay(current);
    return;
  }
  player.play();
}

export function getCurrentTime() {
  return player.currentTime ?? 0;
}

export function isPlaying() {
  return player.playing;
}

export function skipNext() {
  const state = useQueue.getState();
  if (state.queue.length === 0 || state.currentIndex == null) return;
  if (state.repeatMode === "off" && !state.shuffle) {
    if (state.currentIndex >= state.queue.length - 1) return;
  }
  state.next();
}

export function skipPrevious(options?: { force?: boolean }) {
  // Standard music-app behavior: restart current track if > 3s in,
  // otherwise go to the previous track. Never stop playback.
  // When force=true, always go to the previous track (used by swipe gestures).
  if (!options?.force && player.currentTime > 3) {
    player.seekTo(0);
    return;
  }
  const queue = useQueue.getState();
  const previousIndex =
    queue.currentIndex != null ? queue.currentIndex - 1 : -1;
  if (previousIndex >= 0) {
    queue.setCurrentIndex(previousIndex);
  } else if (queue.repeatMode === "all" && queue.queue.length > 0) {
    queue.setCurrentIndex(queue.queue.length - 1);
  } else {
    player.seekTo(0);
  }
}

export function seekTo(seconds: number) {
  player.seekTo(seconds);
}
