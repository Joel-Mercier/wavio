import { requireOptionalNativeModule } from "expo";

/** A renderer found on the local network. */
export type UpnpDevice = {
  /** The device's UDN, or its address when it did not give one. Stable across scans. */
  id: string;
  name: string;
  address: string;
  /** A guess from the device's name, used only to pick an icon. */
  isTV: boolean;
  /**
   * Whether the device confirmed it exposes AVTransport. False means its description
   * could not be fetched in time — it is offered anyway, since silence is not proof
   * a speaker isn't there, but connecting to it may fail.
   */
  verified: boolean;
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
  positionMs: number;
  durationMs: number;
};

type UpnpCastNativeModule = {
  search(timeoutMs: number): Promise<UpnpDevice[]>;
  connect(deviceId: string): Promise<boolean>;
  load(url: string, track: UpnpTrackInfo, autoplay: boolean): Promise<boolean>;
  play(): Promise<boolean>;
  pause(): Promise<boolean>;
  seek(positionMs: number): Promise<boolean>;
  /** 0..100, the range UPnP uses. */
  setVolume(volume: number): Promise<boolean>;
  getVolume(): Promise<number | null>;
  disconnect(): Promise<boolean>;
  addListener(
    event: "state",
    listener: (state: UpnpState) => void,
  ): { remove: () => void };
};

// Autolinked from `modules/upnp-cast`, Android only — iOS would need Apple's
// restricted multicast entitlement before M-SEARCH goes anywhere on real hardware.
// Optional so importing this file is safe on iOS and before a native rebuild.
const Native = requireOptionalNativeModule<UpnpCastNativeModule>("UpnpCast");

/** Whether UPnP casting is available in the current binary. */
export const isUpnpAvailable = (): boolean => Native != null;

export default Native;
