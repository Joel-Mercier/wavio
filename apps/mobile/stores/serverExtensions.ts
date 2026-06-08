import { create } from "zustand";
import type { OpenSubsonicExtensions } from "@/services/openSubsonic/types";
import createSelectors from "@/utils/createSelectors";

// In-memory (non-persisted) cache of the active server's advertised
// OpenSubsonic extensions. Extensions are per-(server, user) and cheaply
// re-fetched on connect, so persisting them would only risk leaking one
// server's capabilities into another's session. Reset on logout / server
// switch via `reset()`.
type ServerExtensionsStore = {
  extensions: OpenSubsonicExtensions[];
  setExtensions: (extensions: OpenSubsonicExtensions[]) => void;
  reset: () => void;
  hasExtension: (name: string, minVersion?: number) => boolean;
};

export const useServerExtensionsBase = create<ServerExtensionsStore>(
  (set, get) => ({
    extensions: [],
    setExtensions: (extensions) => set({ extensions }),
    reset: () => set({ extensions: [] }),
    hasExtension: (name, minVersion) => {
      const ext = get().extensions.find((e) => e.name === name);
      if (!ext) return false;
      if (minVersion === undefined) return true;
      return ext.versions.some((v) => v >= minVersion);
    },
  }),
);

const useServerExtensions = createSelectors(useServerExtensionsBase);

export default useServerExtensions;
