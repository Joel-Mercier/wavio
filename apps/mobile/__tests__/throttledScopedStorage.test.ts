const mockMem = new Map<string, string>();
const mockSet = jest.fn((k: string, v: string) => mockMem.set(k, v));

jest.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    set: (k: string, v: string) => mockSet(k, v),
    getString: (k: string) => mockMem.get(k),
    remove: (k: string) => mockMem.delete(k),
  }),
}));

import {
  createThrottledScopedJSONStorage,
  flushPendingScopedWrites,
  withScopedWritesSuspended,
} from "@/config/storage";

type State = { n: number };

let scope = "a";
const value = (n: number) => ({ state: { n }, version: 0 });

beforeEach(() => {
  jest.useFakeTimers();
  mockMem.clear();
  mockSet.mockClear();
  scope = "a";
});

afterEach(() => {
  flushPendingScopedWrites();
  jest.useRealTimers();
});

const make = () => createThrottledScopedJSONStorage<State>(() => scope, 1000);

describe("createThrottledScopedJSONStorage", () => {
  it("coalesces a burst of writes into one serialization", () => {
    const storage = make();
    for (let n = 0; n < 50; n++) storage.setItem("s", value(n));
    expect(mockSet).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockMem.get("a:s") ?? "")).toEqual(value(49));
  });

  it("lands a write pending across a scope switch in the scope that issued it", () => {
    const storage = make();
    storage.setItem("s", value(1));
    scope = "b";
    storage.setItem("s", value(2));
    jest.advanceTimersByTime(1000);

    expect(JSON.parse(mockMem.get("a:s") ?? "")).toEqual(value(1));
    expect(JSON.parse(mockMem.get("b:s") ?? "")).toEqual(value(2));
  });

  it("drops writes issued while scoped writes are suspended", () => {
    const storage = make();
    withScopedWritesSuspended(() => storage.setItem("s", value(1)));
    jest.advanceTimersByTime(1000);

    expect(mockMem.has("a:s")).toBe(false);
  });

  it("reads back a write that hasn't landed yet", () => {
    const storage = make();
    storage.setItem("s", value(3));

    expect(storage.getItem("s")).toEqual(value(3));
  });

  it("writes everything pending on demand", () => {
    const storage = make();
    storage.setItem("s", value(4));

    flushPendingScopedWrites();

    expect(JSON.parse(mockMem.get("a:s") ?? "")).toEqual(value(4));
  });

  it("never resurrects a key removed while a write to it was pending", () => {
    const storage = make();
    storage.setItem("s", value(5));
    storage.removeItem("s");
    jest.advanceTimersByTime(1000);

    expect(mockMem.has("a:s")).toBe(false);
  });
});
