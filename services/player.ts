import {
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayerStatus,
} from "expo-audio";
import useQueue, { type QueueTrack } from "@/stores/queue";

export const player = createAudioPlayer(null, { updateInterval: 1000 });

let isLoading = false;

function loadAndPlay(track: QueueTrack | null) {
  if (!track) {
    player.pause();
    player.clearLockScreenControls();
    return;
  }
  isLoading = true;
  player.replace({ uri: track.url });
  player.setActiveForLockScreen(true, {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: track.artwork,
  });
  player.play();
  isLoading = false;
}

player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
  if (status.didJustFinish && !isLoading) {
    const queue = useQueue.getState();
    queue.next();
    const current = useQueue.getState().getCurrent();
    if (current) {
      loadAndPlay(current);
    } else {
      player.pause();
      player.clearLockScreenControls();
    }
  }
});

let lastTrackId: string | null = useQueue.getState().getCurrent()?.id ?? null;
useQueue.subscribe((state) => {
  const current =
    state.currentIndex != null ? state.queue[state.currentIndex] : null;
  const id = current?.id ?? null;
  if (id !== lastTrackId) {
    lastTrackId = id;
    loadAndPlay(current);
  }
});

export async function configurePlayback() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}

export function usePlayerStatus() {
  return useAudioPlayerStatus(player);
}

export function usePlayingTrack() {
  return useQueue((store) =>
    store.currentIndex != null ? store.queue[store.currentIndex] : null,
  );
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
  } else {
    player.play();
  }
}

export function pause() {
  player.pause();
}

export function skipNext() {
  const state = useQueue.getState();
  if (state.queue.length === 0 || state.currentIndex == null) return;
  if (state.repeatMode === "off" && !state.shuffle) {
    if (state.currentIndex >= state.queue.length - 1) return;
  }
  state.next();
}

export function skipPrevious() {
  // Standard music-app behavior: restart current track if > 3s in,
  // otherwise go to the previous track. Never stop playback.
  if (player.currentTime > 3) {
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
