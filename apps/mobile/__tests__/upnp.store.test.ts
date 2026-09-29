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
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
}));

import { useUpnpBase } from "@/stores/upnp";

const device = (id: string, address: string, name = id) => ({
  id,
  name,
  address,
  location: `http://${address}:8080/${id}.xml`,
  isTV: false,
});

beforeEach(() => {
  useUpnpBase.getState().__reset();
});

describe("the device list", () => {
  it("keeps two renderers that share a box", () => {
    // An Android TV's own renderer and Kodi's, on different ports.
    useUpnpBase
      .getState()
      .mergeDevices([
        device("tv", "192.168.1.10", "Bravia"),
        device("kodi", "192.168.1.10", "Kodi"),
      ]);
    expect(useUpnpBase.getState().devices.map((d) => d.id)).toEqual([
      "tv",
      "kodi",
    ]);
  });

  it("drops an address-only row once the same box has identified itself", () => {
    useUpnpBase
      .getState()
      .mergeDevices([device("192.168.1.10", "192.168.1.10")]);
    useUpnpBase
      .getState()
      .mergeDevices([device("tv", "192.168.1.10", "Bravia")]);
    expect(useUpnpBase.getState().devices.map((d) => d.name)).toEqual([
      "Bravia",
    ]);
  });

  it("merges across scans rather than replacing", () => {
    useUpnpBase.getState().mergeDevices([device("a", "192.168.1.1")]);
    useUpnpBase.getState().mergeDevices([device("b", "192.168.1.2")]);
    expect(useUpnpBase.getState().devices).toHaveLength(2);
  });
});

describe("renderers played to before", () => {
  it("remembers the most recent first, without duplicates, up to a limit", () => {
    const store = useUpnpBase.getState();
    for (let i = 0; i < 10; i++)
      store.rememberSeen(device(`r${i}`, `10.0.0.${i}`));
    store.rememberSeen(device("r3", "10.0.0.3"));
    const seen = useUpnpBase.getState().seen;
    expect(seen).toHaveLength(8);
    expect(seen[0]?.id).toBe("r3");
    expect(seen.filter((s) => s.id === "r3")).toHaveLength(1);
  });
});
