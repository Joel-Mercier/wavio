import { requireOptionalNativeModule } from "expo";

/** A renderer found on the local network. */
export type UpnpDevice = {
  /** The device's UDN, or its address when it did not give one. Stable across scans. */
  id: string;
  name: string;
  address: string;
  /** The device description URL, which is how a session finds it again after a restart. */
  location: string;
  /** A guess from the device's name, used only to pick an icon. */
  isTV: boolean;
};

/** What the renderer is told about the track, so it doesn't have to guess. */
export type UpnpTrackInfo = {
  mime: string;
  title: string;
  artist?: string;
  album?: string;
  /** Only pass an address the renderer can reach — never a file on this device. */
  artworkUrl?: string;
  durationSec?: number;
};

/**
 * UPnP has no dependable push channel, so the native module polls the renderer once
 * a second and forwards what it finds.
 *
 * `playbackState` is the raw AVTransport transport state. Note that UPnP does not
 * distinguish a track that finished from one that was stopped — both are STOPPED —
 * which is why `services/upnp.ts` has to infer the difference.
 */
export type UpnpState = {
  playbackState:
    | "PLAYING"
    | "PAUSED_PLAYBACK"
    | "STOPPED"
    | "TRANSITIONING"
    | "NO_MEDIA_PRESENT"
    | string;
  /** "OK", or "ERROR_OCCURRED" when the renderer could not play what it was handed. */
  transportStatus?: string;
  positionMs: number;
  durationMs: number;
  /** The URI the renderer says it holds; empty when it does not report one. */
  trackUri?: string;
  /**
   * The load whose track the renderer held when this report was taken (0 before
   * any load). A report from before a handover describes a track that no longer
   * exists, and is dropped by comparing it to the load the app last asked for.
   */
  generation?: number;
};

export type UpnpLoadResult = {
  ok: boolean;
  /**
   * Why not. `superseded` is not a failure: a newer load was asked for before this
   * one reached the renderer, and this one stood down for it.
   */
  reason?:
    | "no_session"
    | "unreachable"
    | "refused"
    | "ignored"
    | "error"
    | "superseded"
    | null;
  generation: number;
  /** What the renderer reported holding once it settled; empty when it reports none. */
  trackUri: string;
};

export type UpnpPauseResult = {
  ok: boolean;
  /**
   * The renderer has no Pause and was stopped instead, losing its position. The
   * app seeks back to where it was on resume.
   */
  stoppedInstead: boolean;
};

type UpnpCastNativeModule = {
  /**
   * Searches every local network for this long. Each renderer is reported as a
   * "device" event the moment its description is in; the promise brings them all
   * once the search is over.
   */
  search(timeoutMs: number): Promise<UpnpDevice[]>;
  /**
   * Listens for renderers announcing themselves, reporting each as a "device"
   * event, until stopped. Holds a multicast lock meanwhile, so only while the
   * output picker is open.
   */
  startListening(): Promise<boolean>;
  stopListening(): Promise<void>;
  /**
   * Re-learns a renderer from a saved description URL without a search. Only
   * registers it; nothing is sent to the device, so it is safe on one that may be
   * playing someone else's music.
   */
  describe(deviceId: string, location: string): Promise<UpnpDevice | null>;
  /** What a known renderer is doing, asked without becoming its controller. */
  probe(deviceId: string): Promise<UpnpState | null>;
  connect(deviceId: string): Promise<boolean>;
  /**
   * Hands a track over: stops the renderer, sets the URI, starts or parks it, then
   * checks what it is actually holding. Not resolved until the renderer has settled,
   * which can take a few seconds on a slow one.
   */
  load(
    url: string,
    track: UpnpTrackInfo,
    autoplay: boolean,
    startPositionMs: number,
    generation: number,
  ): Promise<UpnpLoadResult>;
  /**
   * `resumeAtMs` > 0 seeks there once the renderer reports PLAYING — the way to
   * resume on one that stopped instead of pausing and would otherwise start over.
   */
  play(resumeAtMs: number): Promise<boolean>;
  pause(): Promise<UpnpPauseResult>;
  seek(positionMs: number): Promise<boolean>;
  /** One poll now, outside the schedule. */
  pollNow(): Promise<void>;
  /** 0..100, the range UPnP uses. */
  setVolume(volume: number): Promise<boolean>;
  getVolume(): Promise<number | null>;
  disconnect(): Promise<boolean>;
  addListener(
    event: "device",
    listener: (device: UpnpDevice) => void,
  ): { remove: () => void };
  addListener(
    event: "state",
    listener: (state: UpnpState) => void,
  ): { remove: () => void };
  /** The renderer stopped answering for good; polling has already stopped. */
  addListener(
    event: "lost",
    listener: (event: { deviceId: string }) => void,
  ): { remove: () => void };
};

// Autolinked from `modules/upnp-cast`, Android only — iOS would need Apple's
// restricted multicast entitlement before M-SEARCH goes anywhere on real hardware.
// Optional so importing this file is safe on iOS and before a native rebuild.
const Native = requireOptionalNativeModule<UpnpCastNativeModule>("UpnpCast");

/** Whether UPnP casting is available in the current binary. */
export const isUpnpAvailable = (): boolean => Native != null;

export default Native;
