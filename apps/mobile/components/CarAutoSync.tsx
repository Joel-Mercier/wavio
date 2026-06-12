import { useEffect } from "react";
import { Platform } from "react-native";
import i18n from "@/config/i18n";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  CarAutoBridge,
  type NowPlayingPayload,
} from "@/services/carAuto/bridge";
import { setupCarPlay, updateCarPlayTree } from "@/services/carAuto/carplay";
import { handleBrowsePlay } from "@/services/carAuto/play";
import { buildBrowseTree } from "@/services/carAuto/tree";
import {
  pause,
  play,
  playTracks,
  seekTo,
  skipNext,
  skipPrevious,
  togglePlayPause,
} from "@/services/player";
import { useAuthBase } from "@/stores/auth";
import usePodcasts from "@/stores/podcasts";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";

const REBUILD_DEBOUNCE_MS = 500;
const PLAYBACK_PUSH_INTERVAL_MS = 1000;

const trackToNowPlaying = (
  track: ReturnType<typeof useQueue.getState>["queue"][number] | null,
): NowPlayingPayload | null => {
  if (!track) return null;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artworkUrl: track.artwork,
    durationMs: Math.round((track.duration ?? 0) * 1000),
  };
};

export default function CarAutoSync() {
  useEffect(() => {
    const teardownCarPlay = Platform.OS === "ios" ? setupCarPlay() : () => {};
    if (!CarAutoBridge.available && Platform.OS !== "ios") {
      return teardownCarPlay;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const rebuild = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (cancelled) return;
        const { isAuthenticated, url, username, serverType } =
          useAuthBase.getState();
        // The on-device library has no url/username, so gate on the session
        // being authenticated and only require credentials for remote servers.
        if (!isAuthenticated) return;
        if (serverType !== "local" && (!url || !username)) return;
        const tree = await buildBrowseTree().catch((e) => {
          if (__DEV__) console.log("[carauto] buildBrowseTree threw", e);
          return null;
        });
        if (cancelled || !tree) return;
        if (CarAutoBridge.available) CarAutoBridge.setNodes(tree);
        if (Platform.OS === "ios") updateCarPlayTree(tree);
      }, REBUILD_DEBOUNCE_MS);
    };

    const unsubAuth = useAuthBase.subscribe(rebuild);
    const unsubRecent = useRecentPlays.subscribe(rebuild);
    const unsubPodcasts = usePodcasts.subscribe(rebuild);
    i18n.on("languageChanged", rebuild);
    const unsubPlay = CarAutoBridge.onPlay((mediaId, parentId) => {
      handleBrowsePlay(mediaId, parentId);
    });

    rebuild();

    // === Mirror current track + queue + playback state to native ===
    let lastTrackId: string | null = null;
    let lastQueueSig: string | null = null;
    let lastQueueIndex: number | null = null;
    const pushNowPlaying = () => {
      if (!CarAutoBridge.available) return;
      const current = useQueue.getState().getCurrent();
      const id = current?.id ?? null;
      if (id === lastTrackId) return;
      lastTrackId = id;
      CarAutoBridge.setNowPlaying(trackToNowPlaying(current));
    };

    const pushQueue = () => {
      if (!CarAutoBridge.available) return;
      const q = useQueue.getState();
      const tracks = q.queue
        .map(trackToNowPlaying)
        .filter((t): t is NowPlayingPayload => t != null);
      const idx = q.currentIndex ?? 0;
      // Only re-push the full track list when its contents actually changed;
      // a plain skip just moves the cursor on the already-mirrored queue.
      const sig = tracks.map((t) => t.id).join("|");
      if (sig !== lastQueueSig) {
        lastQueueSig = sig;
        lastQueueIndex = idx;
        CarAutoBridge.setQueue({ tracks, currentIndex: idx });
        return;
      }
      if (idx !== lastQueueIndex) {
        lastQueueIndex = idx;
        CarAutoBridge.setQueueIndex(idx);
      }
    };

    const pushPlaybackState = () => {
      if (!CarAutoBridge.available) return;
      const snap = getPlaybackSnapshot();
      const q = useQueue.getState();
      const repeatMode = q.repeatMode;
      CarAutoBridge.setPlaybackState({
        isPlaying: snap.playing,
        positionMs: Math.round((snap.currentTime ?? 0) * 1000),
        shuffle: q.shuffle,
        repeatMode,
      });
    };

    pushNowPlaying();
    pushQueue();
    pushPlaybackState();

    const unsubQueue = useQueue.subscribe((state, prev) => {
      const curId =
        state.currentIndex != null ? state.queue[state.currentIndex]?.id : null;
      const prevId =
        prev.currentIndex != null ? prev.queue[prev.currentIndex]?.id : null;
      if (curId !== prevId) pushNowPlaying();
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
        pushPlaybackState();
      }
    });

    const unsubPlayback = subscribePlaybackState(pushPlaybackState);

    // Throttled position pulse so AA's timeline keeps advancing even though
    // we don't drive a real Player.
    const interval = setInterval(pushPlaybackState, PLAYBACK_PUSH_INTERVAL_MS);

    // === Transport events from AA → drive expo-audio ===
    const unsubTransport = CarAutoBridge.onTransport((event) => {
      switch (event.action) {
        case "play":
          play();
          break;
        case "pause":
          pause();
          break;
        case "next":
          skipNext();
          break;
        case "previous":
          skipPrevious();
          break;
        case "seek":
          seekTo((event.value ?? 0) / 1000);
          break;
        case "seekToIndex": {
          const idx = Math.round(event.value ?? 0);
          const q = useQueue.getState();
          const target = q.queue[idx];
          if (target) playTracks(q.queue, idx);
          break;
        }
        case "shuffle":
          useQueue.getState().setShuffle(Boolean(event.value));
          break;
        case "repeat":
          useQueue.getState().setRepeatMode(event.value);
          break;
        default:
          // Defensive — togglePlayPause for unknown signals if AA ever sends a
          // bare action.
          togglePlayPause();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      unsubAuth();
      unsubRecent();
      unsubPodcasts();
      i18n.off("languageChanged", rebuild);
      unsubPlay();
      unsubQueue();
      unsubPlayback();
      unsubTransport();
      teardownCarPlay();
    };
  }, []);

  return null;
}
