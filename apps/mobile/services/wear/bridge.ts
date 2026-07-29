import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type {
  CommandPayload,
  ProgressPayload,
  QueuePayload,
  StatePayload,
} from "./protocol";
import { parseCommand } from "./protocol";

// The Android native module is provided by `modules/wear-bridge` (registered as
// WearBridge via Expo Modules). Wear OS is Android-only, so on iOS every method
// here is a no-op.
type WearNative = {
  putState: (json: string) => void;
  putQueue: (json: string) => void;
  putArtwork: (json: string) => void;
  sendProgress: (json: string) => void;
  clearState: () => void;
  getConnectedNodes: () => Promise<string[]>;
  addListener: (
    event: "command" | "connection",
    listener: (e: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

const NativeWear: WearNative | null =
  Platform.OS === "android"
    ? (requireOptionalNativeModule<WearNative>("WearBridge") ?? null)
    : null;

export type ArtworkPayload = {
  /** Cover identity; null for a track that has no cover at all. */
  key: string | null;
  /** Local file:// URI; null when the cover could not be resolved. */
  fileUri: string | null;
};

export const WearBridge = {
  available: NativeWear != null,

  putState(state: StatePayload) {
    if (!NativeWear) return;
    try {
      NativeWear.putState(JSON.stringify(state));
    } catch (e) {
      if (__DEV__) console.log("[wear] putState threw", e);
    }
  },

  putQueue(queue: QueuePayload) {
    if (!NativeWear) return;
    try {
      NativeWear.putQueue(JSON.stringify(queue));
    } catch (e) {
      if (__DEV__) console.log("[wear] putQueue threw", e);
    }
  },

  putArtwork(artwork: ArtworkPayload) {
    if (!NativeWear) return;
    try {
      NativeWear.putArtwork(JSON.stringify(artwork));
    } catch (e) {
      if (__DEV__) console.log("[wear] putArtwork threw", e);
    }
  },

  sendProgress(progress: ProgressPayload) {
    if (!NativeWear) return;
    try {
      NativeWear.sendProgress(JSON.stringify(progress));
    } catch (e) {
      if (__DEV__) console.log("[wear] sendProgress threw", e);
    }
  },

  clearState() {
    if (!NativeWear) return;
    try {
      NativeWear.clearState();
    } catch (e) {
      if (__DEV__) console.log("[wear] clearState threw", e);
    }
  },

  async getConnectedNodes(): Promise<string[]> {
    if (!NativeWear) return [];
    try {
      return await NativeWear.getConnectedNodes();
    } catch (e) {
      if (__DEV__) console.log("[wear] getConnectedNodes threw", e);
      return [];
    }
  },

  onCommand(handler: (command: CommandPayload) => void): () => void {
    if (!NativeWear) return () => {};
    const sub = NativeWear.addListener("command", (event) => {
      const raw = event?.json;
      if (typeof raw !== "string") return;
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        return;
      }
      // Unknown actions decode to null and are dropped — an older phone must
      // never throw on a newer watch's message.
      const command = parseCommand(decoded);
      if (command) handler(command);
    });
    return () => sub.remove();
  },

  onConnection(handler: (connected: boolean) => void): () => void {
    if (!NativeWear) return () => {};
    const sub = NativeWear.addListener("connection", (event) => {
      handler(Boolean(event?.connected));
    });
    return () => sub.remove();
  },
};
