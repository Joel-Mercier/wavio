// In a car the phone UI is usually in the background, where some OEMs (MIUI,
// verified) stop delivering the Choreographer frames RN timers fire from — so
// car code waits through a native Handler message instead of setTimeout.

let mockDelayListener: ((event: Record<string, unknown>) => void) | null = null;
const mockPostDelayed = jest.fn<void, [number, number]>();

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo", () => ({
  requireOptionalNativeModule: () => ({
    postDelayed: (id: number, ms: number) => mockPostDelayed(id, ms),
    addListener: (
      event: string,
      listener: (event: Record<string, unknown>) => void,
    ) => {
      if (event === "delayElapsed") mockDelayListener = listener;
      return { remove: () => {} };
    },
  }),
}));

import { CarAutoBridge } from "@/services/carAuto/bridge";

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("CarAutoBridge.delay", () => {
  it("resolves when native reports that delay elapsed, not before", async () => {
    let done = false;
    void CarAutoBridge.delay(250).then(() => {
      done = true;
    });
    const [id, ms] = mockPostDelayed.mock.calls[0];
    expect(ms).toBe(250);

    await flush();
    expect(done).toBe(false);

    mockDelayListener?.({ id });
    await flush();
    expect(done).toBe(true);
  });

  it("keeps concurrent delays apart", async () => {
    mockPostDelayed.mockClear();
    const settled: string[] = [];
    void CarAutoBridge.delay(10).then(() => settled.push("first"));
    void CarAutoBridge.delay(10).then(() => settled.push("second"));
    const [[firstId], [secondId]] = mockPostDelayed.mock.calls;

    mockDelayListener?.({ id: secondId });
    await flush();
    expect(settled).toEqual(["second"]);

    mockDelayListener?.({ id: firstId });
    await flush();
    expect(settled).toEqual(["second", "first"]);
  });
});
