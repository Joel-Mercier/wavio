const mockFetch = jest.fn();
const mockAddEventListener = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockFetch(...args),
    addEventListener: (...args: unknown[]) => mockAddEventListener(...args),
  },
}));

import {
  getConnectionType,
  getEffectiveMaxBitRate,
  initConnectionType,
  subscribeConnectionType,
} from "@/services/network";

const setCurrentType = async (
  type: "wifi" | "cellular" | "unknown" | "none",
) => {
  let listener: ((state: { type: string }) => void) | null = null;
  mockAddEventListener.mockImplementation((cb) => {
    listener = cb;
    return () => {};
  });
  mockFetch.mockResolvedValueOnce({ type });
  const unsubscribe = initConnectionType();
  // Drain the fetch promise
  await Promise.resolve();
  await Promise.resolve();
  return { listener, unsubscribe };
};

beforeEach(() => {
  mockFetch.mockReset();
  mockAddEventListener.mockReset();
});

describe("getEffectiveMaxBitRate", () => {
  it("returns maxBitRate on wifi", async () => {
    await setCurrentType("wifi");
    expect(getEffectiveMaxBitRate(192, 96)).toBe(192);
    expect(getEffectiveMaxBitRate(null, 96)).toBeNull();
  });

  it("returns lower of the two on cellular", async () => {
    await setCurrentType("cellular");
    expect(getEffectiveMaxBitRate(320, 96)).toBe(96);
    expect(getEffectiveMaxBitRate(64, 128)).toBe(64);
  });

  it("falls back to whichever is set on cellular when only one is provided", async () => {
    await setCurrentType("cellular");
    expect(getEffectiveMaxBitRate(null, 128)).toBe(128);
    expect(getEffectiveMaxBitRate(192, null)).toBe(192);
    expect(getEffectiveMaxBitRate(null, null)).toBeNull();
  });
});

describe("connection type subscription", () => {
  it("getConnectionType reflects updates from NetInfo events", async () => {
    const { listener } = await setCurrentType("wifi");
    expect(getConnectionType()).toBe("wifi");
    listener?.({ type: "cellular" });
    expect(getConnectionType()).toBe("cellular");
  });

  it("subscribeConnectionType notifies on changes", async () => {
    const { listener } = await setCurrentType("wifi");
    const cb = jest.fn();
    const unsubscribe = subscribeConnectionType(cb);
    listener?.({ type: "cellular" });
    expect(cb).toHaveBeenCalledWith("cellular");
    cb.mockClear();
    listener?.({ type: "cellular" });
    expect(cb).not.toHaveBeenCalled();
    unsubscribe();
    listener?.({ type: "wifi" });
    expect(cb).not.toHaveBeenCalled();
  });
});
