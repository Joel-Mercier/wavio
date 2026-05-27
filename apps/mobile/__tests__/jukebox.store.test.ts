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
  useAuthBase: { getState: () => ({ url: "u", username: "n" }) },
}));

import type { JukeboxStatus } from "@/services/openSubsonic/types";
import useJukebox from "@/stores/jukebox";

const get = () => useJukebox.getState();

const reset = () =>
  useJukebox.setState({ active: false, status: null, gain: 0.5 }, false);

beforeEach(() => {
  reset();
});

describe("jukebox store - defaults", () => {
  test("active defaults to false", () => {
    expect(get().active).toBe(false);
  });

  test("status defaults to null", () => {
    expect(get().status).toBeNull();
  });

  test("gain defaults to 0.5", () => {
    expect(get().gain).toBe(0.5);
  });
});

describe("jukebox store - setters", () => {
  test("setActive flips the flag", () => {
    get().setActive(true);
    expect(get().active).toBe(true);
    get().setActive(false);
    expect(get().active).toBe(false);
  });

  test("setStatus stores the latest JukeboxStatus", () => {
    const status: JukeboxStatus = {
      currentIndex: 2,
      gain: 0.7,
      playing: true,
      position: 42,
    };
    get().setStatus(status);
    expect(get().status).toEqual(status);
  });

  test("setStatus accepts null to clear", () => {
    get().setStatus({
      currentIndex: 0,
      gain: 0.5,
      playing: false,
      position: 0,
    });
    get().setStatus(null);
    expect(get().status).toBeNull();
  });

  test("setGain stores the new gain value", () => {
    get().setGain(0.25);
    expect(get().gain).toBe(0.25);
    get().setGain(0);
    expect(get().gain).toBe(0);
    get().setGain(1);
    expect(get().gain).toBe(1);
  });

  test("setters update fields independently", () => {
    get().setActive(true);
    get().setGain(0.8);
    expect(get().active).toBe(true);
    expect(get().gain).toBe(0.8);
    expect(get().status).toBeNull();
  });
});

describe("jukebox store - persistence", () => {
  test("partialize persists only active and gain (not status)", async () => {
    get().setActive(true);
    get().setGain(0.42);
    get().setStatus({
      currentIndex: 1,
      gain: 0.42,
      playing: true,
      position: 10,
    });
    const storage = (
      jest.requireMock("@/config/storage") as {
        createDynamicScopedStorage: () => {
          getItem: (k: string) => string | null;
        };
      }
    ).createDynamicScopedStorage();
    // The persist middleware shares the same in-memory Map across factory
    // calls in the mock, so this still observes the live persisted blob.
    const raw = storage.getItem("jukeboxStore");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted.state.active).toBe(true);
    expect(persisted.state.gain).toBe(0.42);
    expect(persisted.state).not.toHaveProperty("status");
  });
});
