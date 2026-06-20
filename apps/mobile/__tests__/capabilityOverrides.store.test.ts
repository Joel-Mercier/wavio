// Mock MMKV-backed storage with an in-memory implementation.
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import { useCapabilityOverridesBase } from "@/stores/capabilityOverrides";

describe("capabilityOverrides store", () => {
  beforeEach(() => {
    useCapabilityOverridesBase.getState().__reset();
  });

  it("has no overrides by default", () => {
    expect(useCapabilityOverridesBase.getState().overrides).toEqual({});
  });

  it("flips a capability off", () => {
    useCapabilityOverridesBase.getState().disableCapability("sharing");
    expect(useCapabilityOverridesBase.getState().overrides.sharing).toBe(false);
  });

  it("keeps independent capabilities separate", () => {
    useCapabilityOverridesBase.getState().disableCapability("jukebox");
    useCapabilityOverridesBase.getState().disableCapability("podcasts");
    expect(useCapabilityOverridesBase.getState().overrides).toEqual({
      jukebox: false,
      podcasts: false,
    });
  });

  it("is idempotent — re-disabling does not change the reference", () => {
    useCapabilityOverridesBase.getState().disableCapability("sharing");
    const first = useCapabilityOverridesBase.getState().overrides;
    useCapabilityOverridesBase.getState().disableCapability("sharing");
    expect(useCapabilityOverridesBase.getState().overrides).toBe(first);
  });

  it("__reset() clears overrides", () => {
    useCapabilityOverridesBase.getState().disableCapability("sharing");
    useCapabilityOverridesBase.getState().__reset();
    expect(useCapabilityOverridesBase.getState().overrides).toEqual({});
  });
});
