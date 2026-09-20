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
   * between scans; merging means a device only disappears when asked directly,
   * at its own address, and found silent (`forgetDevice`).
   * Never persisted — a device list from a different network is worse than none.
   */
  devices: UpnpDevice[];
  scanning: boolean;
  /** The renderer's own volume, 0..1. UPnP works in 0..100. */
  volume: number;
  session: UpnpPersistedSession | null;
  /**
   * Renderers this app has played to before, most recent first. Asked directly
   * for their description when the picker opens, before any search: one request
   * to a known address needs no multicast, which is the part of discovery that
   * a router or a busy TV most often drops. Bounded, and pruned only by being
   * pushed out — a speaker that is off today may be on tomorrow.
   */
  seen: UpnpSeenRenderer[];
  // True when the renderer from the last session was found still holding our
  // track at app launch and we're prompting the user to resume control. Never
  // persisted.
  pendingResume: boolean;
};

export type UpnpSeenRenderer = Pick<
  UpnpDevice,
  "id" | "name" | "address" | "location" | "isTV"
>;

const MAX_SEEN = 8;

type Actions = {
  setConnected: (deviceId: string | null, deviceName: string | null) => void;
  mergeDevices: (found: UpnpDevice[]) => void;
  forgetDevice: (id: string) => void;
  setScanning: (scanning: boolean) => void;
  setVolume: (volume: number) => void;
  setSession: (session: UpnpPersistedSession | null) => void;
  rememberSeen: (device: UpnpDevice) => void;
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
  seen: [],
  pendingResume: false,
};

/**
 * One row per device.
 *
 * Devices are keyed by UDN, so one box hosting several renderers on different
 * ports — an Android TV's own renderer and Kodi's, say — shows each of them. A
 * device that never gave a UDN is keyed by its address instead, and such a row
 * is dropped when a properly identified device sits at the same address: it is
 * the same box, answering twice, and the row with the friendlier name is the
 * one worth tapping.
 */
function dedupe(devices: UpnpDevice[]): UpnpDevice[] {
  const identified = new Set(
    devices.filter((d) => d.id !== d.address).map((d) => d.address),
  );
  return devices.filter(
    (device) => device.id !== device.address || !identified.has(device.address),
  );
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
      forgetDevice: (id) =>
        set((state) => ({
          devices: state.devices.filter((device) => device.id !== id),
        })),
      setScanning: (scanning) => set({ scanning }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setSession: (session) => set({ session }),
      rememberSeen: (device) =>
        set((state) => ({
          seen: [
            {
              id: device.id,
              name: device.name,
              address: device.address,
              location: device.location,
              isTV: device.isTV,
            },
            ...state.seen.filter((entry) => entry.id !== device.id),
          ].slice(0, MAX_SEEN),
        })),
      setPendingResume: (pendingResume) => set({ pendingResume }),
      __reset: () => set(initialState),
    }),
    {
      name: "upnpStore",
      version: 2,
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      partialize: (state) => ({ session: state.session, seen: state.seen }),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<State>;
        if (version < 2) return { ...state, seen: [] };
        return state;
      },
    },
  ),
);

const useUpnp = createSelectors(useUpnpBase);

export default useUpnp;
export { useUpnpBase };
