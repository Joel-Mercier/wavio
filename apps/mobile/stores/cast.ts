import { create } from "zustand";
import createSelectors from "@/utils/createSelectors";

// The Chromecast session as the app sees it. Never persisted: the Cast SDK owns
// the session and hands it back on launch by itself (services/cast.ts asks), so a
// stored copy would only ever be stale.
type State = {
  active: boolean;
  sessionId: string | null;
  deviceName: string | null;
  /** The receiver's own volume, 0..1. */
  volume: number;
  /**
   * The SDK put the session on hold (iOS does this in the background). The
   * receiver plays on; commands wait for it to come back.
   */
  suspended: boolean;
  /**
   * Whether the Cast SDK is usable on this device at all — false without Google
   * Play services, or on a TV. Null until asked.
   */
  available: boolean | null;
};

type Actions = {
  setSession: (sessionId: string | null, deviceName: string | null) => void;
  setDeviceName: (deviceName: string | null) => void;
  setVolume: (volume: number) => void;
  setSuspended: (suspended: boolean) => void;
  setAvailable: (available: boolean) => void;
  __reset: () => void;
};

const initialState: State = {
  active: false,
  sessionId: null,
  deviceName: null,
  volume: 0.3,
  suspended: false,
  available: null,
};

const useCastBase = create<State & Actions>()((set) => ({
  ...initialState,
  setSession: (sessionId, deviceName) =>
    set({ active: sessionId != null, sessionId, deviceName, suspended: false }),
  setDeviceName: (deviceName) => set({ deviceName }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setSuspended: (suspended) => set({ suspended }),
  setAvailable: (available) => set({ available }),
  __reset: () => set(initialState),
}));

const useCast = createSelectors(useCastBase);

export default useCast;
export { useCastBase };
