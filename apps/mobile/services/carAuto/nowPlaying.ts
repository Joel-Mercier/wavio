import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  getCurrentFavorite,
  getPlaybackRateFor,
  subscribeCurrentFavorite,
} from "@/services/player";
import { useAuthBase } from "@/stores/auth";
import { carAutoSettings, useCarAutoBase } from "@/stores/carAuto";
import useOffline from "@/stores/offline";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { isLibraryTrack, isSpokenWordTrack } from "@/utils/trackSource";
import {
  CarAutoBridge,
  type CarErrorPayload,
  type NowPlayingPayload,
  type PlayerButtonsPayload,
} from "./bridge";
import { isCarConnected, subscribeCarConnection } from "./connection";
import { encodeMediaId } from "./mediaId";
import { t } from "./nodes";

const QUEUE_WINDOW = 50;
const QUEUE_EDGE = 10;
const SEEK_TOLERANCE_MS = 1500;

export function trackToNowPlaying(
  track: QueueTrack | null | undefined,
): NowPlayingPayload | null {
  if (!track) return null;
  const artistId = isLibraryTrack(track) ? track.artists?.[0]?.id : undefined;
  return {
    id: track.id,
    title: track.title || undefined,
    artist: track.artist || undefined,
    album: track.album || undefined,
    artworkUrl: track.artwork || undefined,
    durationMs: Math.round((track.duration ?? 0) * 1000),
    artistMediaId: artistId
      ? encodeMediaId({ kind: "artist", id: artistId })
      : undefined,
    explicit: track.explicitStatus === "explicit" || undefined,
    downloaded: useOffline.getState().isTrackDownloaded(track.id) || undefined,
  };
}

type Window = { start: number; length: number; ids: string };

let lastTrackId: string | null | undefined;
let lastWindow: Window | null = null;
let lastIndex: number | null = null;
let lastState: {
  positionMs: number;
  at: number;
  playing: boolean;
  speed: number;
} | null = null;
let lastButtons: string | null = null;
let lastError: string | null = null;

export function pushNowPlaying(force = false) {
  const current = useQueue.getState().getCurrent();
  const id = current?.id ?? null;
  if (!force && id === lastTrackId) return;
  lastTrackId = id;
  CarAutoBridge.setNowPlaying(trackToNowPlaying(current));
}

export function pushQueue(force = false) {
  const { queue, currentIndex } = useQueue.getState();
  const index = currentIndex ?? 0;
  const window = lastWindow;
  if (!force && window) {
    const end = window.start + window.length;
    const unchanged =
      queue
        .slice(window.start, end)
        .map((track) => track.id)
        .join("|") === window.ids;
    const roomBefore = window.start === 0 || index - window.start >= QUEUE_EDGE;
    const roomAfter = end >= queue.length || end - index > QUEUE_EDGE;
    if (
      unchanged &&
      index >= window.start &&
      index < end &&
      roomBefore &&
      roomAfter
    ) {
      if (index !== lastIndex) {
        lastIndex = index;
        CarAutoBridge.setQueueIndex(index - window.start);
      }
      return;
    }
  }
  const start = Math.max(0, index - QUEUE_WINDOW);
  const slice = queue.slice(start, index + QUEUE_WINDOW + 1);
  lastWindow = {
    start,
    length: slice.length,
    ids: slice.map((track) => track.id).join("|"),
  };
  lastIndex = index;
  CarAutoBridge.setQueue({
    tracks: slice
      .map(trackToNowPlaying)
      .filter((track): track is NowPlayingPayload => track != null),
    currentIndex: index - start,
    offset: start,
  });
}

export function queueOffset(): number {
  return lastWindow?.start ?? 0;
}

export function pushPlaybackState(force = false) {
  const snapshot = getPlaybackSnapshot();
  const queue = useQueue.getState();
  const speed = getPlaybackRateFor(queue.getCurrent());
  const positionMs = Math.round((snapshot.currentTime ?? 0) * 1000);
  const now = Date.now();
  if (!force && lastState && lastState.playing === snapshot.playing) {
    const expected = lastState.playing
      ? lastState.positionMs + (now - lastState.at) * lastState.speed
      : lastState.positionMs;
    if (
      Math.abs(expected - positionMs) < SEEK_TOLERANCE_MS &&
      lastState.speed === speed
    ) {
      return;
    }
  }
  lastState = { positionMs, at: now, playing: snapshot.playing, speed };
  CarAutoBridge.setPlaybackState({
    isPlaying: snapshot.playing,
    buffering: snapshot.buffering,
    positionMs,
    speed,
    shuffle: queue.shuffle,
    repeatMode: queue.repeatMode,
  });
}

export function pushButtons(force = false) {
  const current = useQueue.getState().getCurrent();
  const { playerButtons } = carAutoSettings();
  const longForm = isSpokenWordTrack(current);
  const music = isLibraryTrack(current);
  const queueModes = !longForm && !current?.isRadio;
  const buttons: PlayerButtonsPayload = {
    favorite: playerButtons.favorite && music ? getCurrentFavorite() : null,
    shuffle: playerButtons.shuffle && queueModes,
    repeat: playerButtons.repeat && queueModes,
    radio: playerButtons.radio && music,
    longForm,
  };
  const key = JSON.stringify(buttons);
  if (!force && key === lastButtons) return;
  lastButtons = key;
  CarAutoBridge.setPlayerButtons(buttons);
}

function currentError(): CarErrorPayload {
  if (!useAuthBase.getState().isAuthenticated) {
    return { code: "authentication", message: t("errors.signedOut") };
  }
  const queue = useQueue.getState();
  if (
    !getIsEffectivelyOnline() &&
    !queue.getCurrent() &&
    useOffline.getState().getDownloadedTracksCount() === 0
  ) {
    return { code: "network", message: t("errors.offline") };
  }
  return null;
}

export function pushError(force = false) {
  const error = currentError();
  const key = JSON.stringify(error);
  if (!force && key === lastError) return;
  lastError = key;
  CarAutoBridge.setError(error);
}

export function pushAll() {
  pushQueue(true);
  pushNowPlaying(true);
  pushPlaybackState(true);
  pushButtons(true);
  pushError(true);
}

let started = false;

export function startPlaybackMirror() {
  if (started || !CarAutoBridge.available) return;
  started = true;
  pushAll();

  useQueue.subscribe((state, prev) => {
    const currentId =
      state.currentIndex != null ? state.queue[state.currentIndex]?.id : null;
    const prevId =
      prev.currentIndex != null ? prev.queue[prev.currentIndex]?.id : null;
    if (currentId !== prevId) {
      pushNowPlaying();
      pushButtons();
    }
    if (
      state.queue !== prev.queue ||
      state.currentIndex !== prev.currentIndex
    ) {
      pushQueue();
    }
    if (
      state.shuffle !== prev.shuffle ||
      state.repeatMode !== prev.repeatMode
    ) {
      pushPlaybackState(true);
    }
    if ((currentId == null) !== (prevId == null)) pushError();
  });
  subscribePlaybackState(() => pushPlaybackState(true));
  let stopProgress: (() => void) | null = null;
  const followProgress = (connected: boolean) => {
    if (connected && !stopProgress) {
      stopProgress = subscribePlaybackProgress(() => pushPlaybackState());
    } else if (!connected && stopProgress) {
      stopProgress();
      stopProgress = null;
    }
  };
  subscribeCarConnection(followProgress);
  followProgress(isCarConnected());
  subscribeCurrentFavorite(() => pushButtons());
  useCarAutoBase.subscribe((state, prev) => {
    if (state.playerButtons !== prev.playerButtons) pushButtons();
  });
  useAuthBase.subscribe((state, prev) => {
    if (state.isAuthenticated !== prev.isAuthenticated) pushError();
  });
  subscribeEffectiveOnline(() => pushError());
}
