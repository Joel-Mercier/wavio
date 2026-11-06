import {
  addTransportChangeListener,
  getEngineState,
  getHostTransport,
  isHttpStackAvailable,
  setHttp3Enabled,
} from "@/modules/http-stack";

describe("http-stack bridge without the native module", () => {
  it("reports unavailable and returns safe values", () => {
    expect(isHttpStackAvailable()).toBe(false);
    expect(getEngineState()).toBeNull();
    expect(getHostTransport("music.example.com")).toBeNull();
    expect(() => setHttp3Enabled(true)).not.toThrow();
    const unsubscribe = addTransportChangeListener(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});
