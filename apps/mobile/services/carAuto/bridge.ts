import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { backgroundSleep } from "@/services/backgroundTimer";
import { artFallbackFor } from "./mediaId";
import type { BrowseNode, ItemAction } from "./types";

type Listener = (event: Record<string, unknown>) => void;

type CarAutoNative = {
  setChildren: (parentId: string, json: string | null) => void;
  invalidateChildren: (json: string | null) => void;
  clearChildren: () => void;
  setSearchResults: (query: string, json: string | null) => void;
  answerAction: (requestId: number, json: string) => void;
  setNowPlaying: (json: string | null) => void;
  setQueue: (json: string) => void;
  setQueueIndex: (index: number) => void;
  setPlaybackState: (json: string) => void;
  setPlayerButtons: (json: string) => void;
  setLabels: (json: string) => void;
  setError: (json: string | null) => void;
  setArtworkHeaders: (json: string) => void;
  clearArtworkCache: () => void;
  notifyReady: () => void;
  setVerbose: (enabled: boolean) => void;
  isCarConnected: () => boolean;
  addListener: (event: string, listener: Listener) => { remove: () => void };
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
  artistMediaId?: string;
  explicit?: boolean;
  downloaded?: boolean;
};

export type PlaybackStatePayload = {
  isPlaying: boolean;
  buffering: boolean;
  positionMs: number;
  speed: number;
  shuffle: boolean;
  repeatMode: "off" | "all" | "one";
};

export type QueuePayload = {
  tracks: NowPlayingPayload[];
  currentIndex: number;
  offset: number;
};

export type PlayerButtonsPayload = {
  favorite: boolean | null;
  shuffle: boolean;
  repeat: boolean;
  radio: boolean;
  longForm: boolean;
};

export type CarErrorPayload = {
  code: "authentication" | "network" | "setup";
  message: string;
  transient?: boolean;
} | null;

export type ActionAnswer = {
  ok: boolean;
  message?: string;
  refreshItem?: string;
  showPlaying?: boolean;
};

export type VoiceRequest = {
  query: string;
  artist?: string;
  album?: string;
  genre?: string;
  playlist?: string;
  title?: string;
};

export type TransportEvent =
  | { action: "play" | "pause" | "next" | "previous" }
  | { action: "favorite" | "radio" | "seekBack" | "seekForward" }
  | { action: "seek"; value: number }
  | { action: "seekToIndex"; value: number }
  | { action: "shuffle"; value: number }
  | { action: "repeat"; value: "off" | "all" | "one" };

const call = (name: string, run: (native: CarAutoNative) => void) => {
  if (!NativeCarAuto) return;
  try {
    run(NativeCarAuto);
  } catch (e) {
    if (__DEV__) console.log(`[carauto] ${name} threw`, e);
  }
};

const listen = (event: string, handler: Listener): (() => void) => {
  if (!NativeCarAuto) return () => {};
  const sub = NativeCarAuto.addListener(event, handler);
  return () => sub.remove();
};

const serializeNodes = (nodes: BrowseNode[]) =>
  JSON.stringify(
    nodes.map((node) =>
      node.icon ? node : { ...node, artFallback: artFallbackFor(node.id) },
    ),
  );

const str = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;

export const CarAutoBridge = {
  available: NativeCarAuto != null,

  setChildren(parentId: string, nodes: BrowseNode[] | null) {
    call("setChildren", (native) =>
      native.setChildren(parentId, nodes ? serializeNodes(nodes) : null),
    );
  },

  invalidateChildren(parentIds: string[] | null) {
    call("invalidateChildren", (native) =>
      native.invalidateChildren(parentIds ? JSON.stringify(parentIds) : null),
    );
  },

  clearChildren() {
    call("clearChildren", (native) => native.clearChildren());
  },

  setSearchResults(query: string, nodes: BrowseNode[] | null) {
    call("setSearchResults", (native) =>
      native.setSearchResults(query, nodes ? serializeNodes(nodes) : null),
    );
  },

  answerAction(requestId: number, answer: ActionAnswer) {
    call("answerAction", (native) =>
      native.answerAction(requestId, JSON.stringify(answer)),
    );
  },

  setNowPlaying(track: NowPlayingPayload | null) {
    call("setNowPlaying", (native) =>
      native.setNowPlaying(track ? JSON.stringify(track) : null),
    );
  },

  setQueue(payload: QueuePayload) {
    call("setQueue", (native) => native.setQueue(JSON.stringify(payload)));
  },

  setQueueIndex(index: number) {
    call("setQueueIndex", (native) => native.setQueueIndex(index));
  },

  setPlaybackState(state: PlaybackStatePayload) {
    call("setPlaybackState", (native) =>
      native.setPlaybackState(JSON.stringify(state)),
    );
  },

  setPlayerButtons(buttons: PlayerButtonsPayload) {
    call("setPlayerButtons", (native) =>
      native.setPlayerButtons(JSON.stringify(buttons)),
    );
  },

  setLabels(labels: Record<string, string>) {
    call("setLabels", (native) => native.setLabels(JSON.stringify(labels)));
  },

  setError(error: CarErrorPayload) {
    call("setError", (native) =>
      native.setError(error ? JSON.stringify(error) : null),
    );
  },

  setArtworkHeaders(headers: Record<string, Record<string, string>>) {
    call("setArtworkHeaders", (native) =>
      native.setArtworkHeaders(JSON.stringify(headers)),
    );
  },

  clearArtworkCache() {
    call("clearArtworkCache", (native) => native.clearArtworkCache());
  },

  notifyReady() {
    call("notifyReady", (native) => native.notifyReady());
  },

  setVerbose(enabled: boolean) {
    call("setVerbose", (native) => native.setVerbose(enabled));
  },

  delay: backgroundSleep,

  isCarConnected(): boolean {
    if (!NativeCarAuto) return false;
    try {
      return NativeCarAuto.isCarConnected();
    } catch {
      return false;
    }
  },

  onCarConnection(handler: (connected: boolean) => void) {
    return listen("carConnection", (event) =>
      handler(event?.connected === true),
    );
  },

  onPlay(handler: (mediaId: string) => void) {
    return listen("play", (event) => {
      const id = str(event?.mediaId);
      if (id) handler(id);
    });
  },

  onPlaySearch(handler: (request: VoiceRequest) => void) {
    return listen("playSearch", (event) =>
      handler({
        query: typeof event?.query === "string" ? event.query : "",
        artist: str(event?.artist),
        album: str(event?.album),
        genre: str(event?.genre),
        playlist: str(event?.playlist),
        title: str(event?.title),
      }),
    );
  },

  onChildrenRequest(handler: (parentId: string) => void) {
    return listen("childrenRequest", (event) => {
      const id = str(event?.parentId);
      if (id) handler(id);
    });
  },

  onSearchRequest(handler: (query: string) => void) {
    return listen("searchRequest", (event) => {
      if (typeof event?.query === "string") handler(event.query);
    });
  },

  onItemAction(
    handler: (requestId: number, action: ItemAction, mediaId: string) => void,
  ) {
    return listen("itemAction", (event) => {
      const requestId = event?.requestId;
      const action = str(event?.action) as ItemAction | undefined;
      const mediaId = str(event?.mediaId);
      if (typeof requestId === "number" && action && mediaId) {
        handler(requestId, action, mediaId);
      }
    });
  },

  onTransport(handler: (event: TransportEvent) => void) {
    return listen("transport", (event) => {
      if (typeof event?.action === "string") {
        handler(event as unknown as TransportEvent);
      }
    });
  },
};
