import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import type { UpnpDevice } from "@/modules/upnp-cast";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

/**
 * Enough to find the renderer again after a restart and to tell whether it is
 * still playing what we gave it. The only persisted part of the store: a
 * renderer holds one URI and no queue, so this is the whole of the session.
 */
export type UpnpPersistedSession = {
  deviceId: string;
  deviceName: string;
  address: string;
  location: string;
  trackId: string;
  trackUrl: string;
};

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
  session: UpnpPersistedSession | null;
  // True when the renderer from the last session was found still holding our
  // track at app launch and we're prompting the user to resume control. Never
  // persisted.
  pendingResume: boolean;
};

type Actions = {
  setConnected: (deviceId: string | null, deviceName: string | null) => void;
  mergeDevices: (found: UpnpDevice[]) => void;
  setScanning: (scanning: boolean) => void;
  setVolume: (volume: number) => void;
  setSession: (session: UpnpPersistedSession | null) => void;
  setPendingResume: (pendingResume: boolean) => void;
  __reset: () => void;
};

const initialState: State = {
  connected: false,
  deviceId: null,
  deviceName: null,
  devices: [],
  scanning: false,
  volume: 0.3,
  session: null,
  pendingResume: false,
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

const useUpnpBase = create<State & Actions>()(
  persist(
    (set) => ({
      ...initialState,
      setConnected: (deviceId, deviceName) =>
        set({ connected: deviceId != null, deviceId, deviceName }),
      mergeDevices: (found) =>
        set((state) => {
          const byId = new Map(
            state.devices.map((device) => [device.id, device]),
          );
          for (const device of found) byId.set(device.id, device);
          return { devices: dedupe([...byId.values()]) };
        }),
      setScanning: (scanning) => set({ scanning }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setSession: (session) => set({ session }),
      setPendingResume: (pendingResume) => set({ pendingResume }),
      __reset: () => set(initialState),
    }),
    {
      name: "upnpStore",
      version: 1,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      partialize: (state) => ({ session: state.session }),
    },
  ),
);

const useUpnp = createSelectors(useUpnpBase);

export default useUpnp;
export { useUpnpBase };
