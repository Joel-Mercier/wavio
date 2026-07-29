/**
 * Wire protocol between the phone and the Wear OS companion app.
 *
 * This file is the source of truth. `apps/mobile/wear/src/main/java/com/
 * jmercier/wavio/wear/data/Protocol.kt` mirrors it on the watch, and the native
 * bridge (`modules/wear-bridge`) is a dumb pipe that never inspects payloads —
 * it moves JSON strings between JS and the Data Layer.
 *
 * Transport split:
 *  - DataClient (retained, replicated by Play Services) carries state + queue.
 *    A watch that wakes, reconnects, or cold-starts reads the current value
 *    locally, so reconnect needs no handshake and no polling.
 *  - MessageClient (fire-and-forget) carries commands up and progress
 *    corrections down. Nothing durable rides on it.
 *
 * Versioning rules — the watch and the phone ship separately and will run
 * mismatched versions, so both sides must stay compatible in both directions:
 *  1. Every payload carries `v`. Readers ignore unknown fields and unknown
 *     `action` values; neither side may throw on an unrecognised message.
 *  2. New fields are optional and have a safe default on the reader side.
 *     Volume, sleep timer, lyrics indicator, device switching, voice actions,
 *     Tiles and complications all fit as additive fields or new `action`
 *     values under /v1/ — none of them need a version bump.
 *  3. Only a change to the *meaning* of an existing field bumps the path to
 *     /wavio/v2/…, and the phone then publishes both paths for one release
 *     cycle so older watches keep working.
 *  4. The watch reports its own version in `hello`, so the phone can withhold
 *     newer fields from older watches.
 */

export const PROTOCOL_VERSION = 1;

/** DataClient, retained: now-playing metadata + transport state + artwork asset. */
export const PATH_STATE = "/wavio/v1/state";
/** DataClient, retained: the queue listing. */
export const PATH_QUEUE = "/wavio/v1/queue";
/**
 * DataClient, retained: the current cover art, as its own item so that a state
 * push never has to re-attach the bitmap (a DataItem write replaces the whole
 * item, assets included — keeping artwork here is what makes "artwork only on
 * change" actually hold).
 */
export const PATH_ARTWORK = "/wavio/v1/artwork";
/** MessageClient, watch → phone. */
export const PATH_COMMAND = "/wavio/v1/command";
/** MessageClient, phone → watch. */
export const PATH_PROGRESS = "/wavio/v1/progress";

/** Advertised by the phone app so the watch knows Wavio is installed there. */
export const CAPABILITY_PHONE = "wavio_phone";
/** Advertised by the watch app so the phone knows it has an audience. */
export const CAPABILITY_WATCH = "wavio_watch";

/** Key of the artwork asset attached to the PATH_STATE DataItem. */
export const ASSET_ARTWORK = "artwork";

export type RepeatMode = "off" | "all" | "one";

export type WearTrack = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  durationMs: number;
};

export type StatePayload = {
  v: number;
  track: WearTrack | null;
  /**
   * Stable identity of the current cover art (we use the artwork URL). The
   * native side only re-attaches the artwork asset when this changes, so a
   * pause/resume or a seek never re-sends the bitmap over Bluetooth.
   */
  artworkKey: string | null;
  isPlaying: boolean;
  positionMs: number;
  /**
   * Phone-side `Date.now()` when `positionMs` was sampled.
   *
   * The watch extrapolates the position against its own clock instead of
   * polling, so it needs to know how old this sample is. For a live message
   * that is ~0, but state items are *retained* — a watch waking after an hour
   * reads a value written an hour ago, and stamping it as "now" would leave the
   * ring an hour behind. Wear OS keeps the watch clock synced to the phone, so
   * the difference of the two wall clocks is a good staleness estimate; the
   * watch clamps it to guard against whatever skew survives.
   */
  sentAtEpochMs: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  canSeek: boolean;
};

export type QueueEntry = {
  id: string;
  title?: string;
  artist?: string;
};

/**
 * A window of the queue, not the whole thing: a DataItem caps at 100KB and
 * queues run to MAX_QUEUE_TRACKS (1000), which would not fit and would be
 * pointless to scroll on a watch anyway.
 */
export const QUEUE_WINDOW_BEHIND = 10;
export const QUEUE_WINDOW_AHEAD = 40;

export type QueuePayload = {
  v: number;
  /** Content signature; the watch re-renders the list only when this changes. */
  sig: string;
  /** Absolute index in the phone's queue of `tracks[0]`. */
  baseIndex: number;
  /** Absolute index of the playing track; `-1` when nothing is playing. */
  currentIndex: number;
  /** Length of the full phone-side queue, for "12 of 340" style labels. */
  total: number;
  tracks: QueueEntry[];
};

export type ProgressPayload = {
  v: number;
  positionMs: number;
  sentAtEpochMs: number;
  isPlaying: boolean;
};

export type CommandPayload =
  | { v: number; action: "play" | "pause" | "next" | "previous" }
  /** Absolute seek target, in milliseconds. */
  | { v: number; action: "seek"; value: number }
  | { v: number; action: "seekToIndex"; value: number }
  | { v: number; action: "shuffle"; value: boolean }
  | { v: number; action: "repeat"; value: RepeatMode }
  /** Watch screen became visible / hidden — gates the progress ticker. */
  | { v: number; action: "subscribe" | "unsubscribe" }
  | { v: number; action: "hello"; protocolVersion: number };

export type CommandAction = CommandPayload["action"];

/**
 * Narrow an untrusted decoded message into a CommandPayload. Returns null for
 * anything unrecognised rather than throwing — rule 1 above.
 */
export const parseCommand = (raw: unknown): CommandPayload | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const action = o.action;
  if (typeof action !== "string") return null;
  const v = typeof o.v === "number" ? o.v : PROTOCOL_VERSION;

  switch (action) {
    case "play":
    case "pause":
    case "next":
    case "previous":
    case "subscribe":
    case "unsubscribe":
      return { v, action };
    case "seek":
    case "seekToIndex":
      return typeof o.value === "number" ? { v, action, value: o.value } : null;
    case "shuffle":
      return { v, action, value: Boolean(o.value) };
    case "repeat":
      return o.value === "off" || o.value === "all" || o.value === "one"
        ? { v, action, value: o.value }
        : null;
    case "hello":
      return {
        v,
        action,
        protocolVersion:
          typeof o.protocolVersion === "number" ? o.protocolVersion : 1,
      };
    default:
      return null;
  }
};
