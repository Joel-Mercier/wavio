import { create } from "zustand";
import type { UpnpDevice } from "@/modules/upnp-cast";
import createSelectors from "@/utils/createSelectors";

type State = {
  connected: boolean;
  deviceId: string | null;
  deviceName: string | null;
  /**
   * Renderers seen this session, merged across scans rather than replaced.
   *
   * SSDP runs over UDP and loses packets, so a device that missed one round is
   * usually still there. Replacing the list makes speakers blink in and out
   * between scans; merging means a device only ever disappears when the app does.
   * Never persisted — a device list from a different network is worse than none.
   */
  devices: UpnpDevice[];
  scanning: boolean;
  /** The renderer's own volume, 0..1. UPnP works in 0..100. */
  volume: number;
};

type Actions = {
  setConnected: (deviceId: string | null, deviceName: string | null) => void;
  mergeDevices: (found: UpnpDevice[]) => void;
  setScanning: (scanning: boolean) => void;
  setVolume: (volume: number) => void;
  __reset: () => void;
};

const initialState: State = {
  connected: false,
  deviceId: null,
  deviceName: null,
  devices: [],
  scanning: false,
  volume: 0.3,
};

/**
 * One row per device, keeping the friendlier name.
 *
 * A speaker can answer discovery more than once — as its own device type and as
 * a root device — and the two answers do not always carry the same name. Two
 * rows for one speaker is confusing enough; one of them showing a bare IP
 * address is worse, and just as likely to be the one tapped.
 */
function dedupe(devices: UpnpDevice[]): UpnpDevice[] {
  const byAddress = new Map<string, UpnpDevice>();
  for (const device of devices) {
    const key = device.address || device.id;
    const kept = byAddress.get(key);
    if (
      !kept ||
      (looksLikeAddress(kept.name) && !looksLikeAddress(device.name))
    ) {
      byAddress.set(key, device);
    }
  }
  return [...byAddress.values()];
}

function looksLikeAddress(name: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}\b/.test(name.trim());
}

const useUpnpBase = create<State & Actions>()((set) => ({
  ...initialState,
  setConnected: (deviceId, deviceName) =>
    set({ connected: deviceId != null, deviceId, deviceName }),
  mergeDevices: (found) =>
    set((state) => {
      const byId = new Map(state.devices.map((device) => [device.id, device]));
      for (const device of found) byId.set(device.id, device);
      return { devices: dedupe([...byId.values()]) };
    }),
  setScanning: (scanning) => set({ scanning }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  __reset: () => set(initialState),
}));

const useUpnp = createSelectors(useUpnpBase);

export default useUpnp;
export { useUpnpBase };
