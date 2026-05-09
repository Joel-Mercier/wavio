import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { BrowseTree } from "./types";

// The Android native module is provided by `modules/car-auto` (registered as
// CarAuto via Expo Modules). On iOS the bridge is a no-op; CarPlay is handled
// in services/carAuto/carplay.ts via react-native-carplay.
type CarAutoNative = {
  setNodes: (json: string) => void;
  setNowPlaying: (json: string | null) => void;
  setQueue: (json: string) => void;
  setPlaybackState: (json: string) => void;
  addListener: (
    event: "play" | "transport",
    listener: (e: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

const NativeCarAuto: CarAutoNative | null =
  Platform.OS === "android"
    ? (requireOptionalNativeModule<CarAutoNative>("CarAuto") ?? null)
    : null;

export type NowPlayingPayload = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  durationMs: number;
};

export type PlaybackStatePayload = {
  isPlaying: boolean;
  positionMs: number;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
};

export type TransportEvent =
  | { action: "play" | "pause" | "next" | "previous" }
  | { action: "seek"; value: number }
  | { action: "seekToIndex"; value: number }
  | { action: "shuffle"; value: number }
  | { action: "repeat"; value: "off" | "all" | "one" };

export type QueuePayload = {
  tracks: NowPlayingPayload[];
  currentIndex: number;
};

export const CarAutoBridge = {
  available: NativeCarAuto != null,

  setNodes(tree: BrowseTree) {
    if (!NativeCarAuto) return;
    try {
      const json = JSON.stringify({ nodes: tree });
      NativeCarAuto.setNodes(json);
    } catch (e) {
      console.log("[carauto] setNodes threw", e);
    }
  },

  setNowPlaying(track: NowPlayingPayload | null) {
    if (!NativeCarAuto) return;
    try {
      NativeCarAuto.setNowPlaying(track ? JSON.stringify(track) : null);
    } catch (e) {
      console.log("[carauto] setNowPlaying threw", e);
    }
  },

  setQueue(payload: QueuePayload) {
    if (!NativeCarAuto) return;
    try {
      NativeCarAuto.setQueue(JSON.stringify(payload));
    } catch (e) {
      console.log("[carauto] setQueue threw", e);
    }
  },

  setPlaybackState(state: PlaybackStatePayload) {
    if (!NativeCarAuto) return;
    try {
      NativeCarAuto.setPlaybackState(JSON.stringify(state));
    } catch (e) {
      console.log("[carauto] setPlaybackState threw", e);
    }
  },

  onPlay(handler: (mediaId: string, parentId?: string) => void): () => void {
    if (!NativeCarAuto) return () => {};
    const sub = NativeCarAuto.addListener("play", (event) => {
      const id = event?.mediaId;
      if (typeof id !== "string" || !id) return;
      const parent = event?.parentId;
      handler(id, typeof parent === "string" && parent ? parent : undefined);
    });
    return () => sub.remove();
  },

  onTransport(handler: (event: TransportEvent) => void): () => void {
    if (!NativeCarAuto) return () => {};
    const sub = NativeCarAuto.addListener("transport", (event) => {
      const action = event?.action;
      if (typeof action !== "string") return;
      handler(event as unknown as TransportEvent);
    });
    return () => sub.remove();
  },
};
