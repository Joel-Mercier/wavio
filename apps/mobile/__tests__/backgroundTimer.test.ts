type Listener = (event: Record<string, unknown>) => void;

type Timers = typeof import("@/services/backgroundTimer");

function loadWithNative() {
  const posted: { id: number; ms: number }[] = [];
  const cancelled: number[] = [];
  let listener: Listener | null = null;
  let timers!: Timers;
  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: "android" } }));
    jest.doMock("expo", () => ({
      requireOptionalNativeModule: () => ({
        postDelayed: (id: number, ms: number) => posted.push({ id, ms }),
        cancelDelayed: (id: number) => cancelled.push(id),
        addListener: (_event: string, l: Listener) => {
          listener = l;
          return { remove: () => {} };
        },
      }),
    }));
    timers = require("@/services/backgroundTimer");
  });
  const elapse = (id: number) => listener?.({ id });
  return { timers, posted, cancelled, elapse };
}

function loadWithoutNative() {
  let timers!: Timers;
  jest.isolateModules(() => {
    jest.doMock("react-native", () => ({ Platform: { OS: "ios" } }));
    jest.doMock("expo", () => ({ requireOptionalNativeModule: () => null }));
    timers = require("@/services/backgroundTimer");
  });
  return timers;
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("backgroundTimer on the native Handler", () => {
  it("fires a timeout once, when native reports it elapsed", () => {
    const { timers, posted, elapse } = loadWithNative();
    const fn = jest.fn();
    const handle = timers.setBackgroundTimeout(fn, 250);
    expect(posted).toEqual([{ id: handle, ms: 250 }]);
    expect(fn).not.toHaveBeenCalled();

    elapse(handle);
    elapse(handle);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("never fires a cleared timeout, and tells native to drop it", () => {
    const { timers, cancelled, elapse } = loadWithNative();
    const fn = jest.fn();
    const handle = timers.setBackgroundTimeout(fn, 100);
    timers.clearBackgroundTimer(handle);
    expect(cancelled).toEqual([handle]);

    elapse(handle);
    expect(fn).not.toHaveBeenCalled();
  });

  it("re-arms an interval on every tick until cleared", () => {
    const { timers, posted, cancelled, elapse } = loadWithNative();
    const fn = jest.fn();
    const handle = timers.setBackgroundInterval(fn, 1000);
    elapse(handle);
    elapse(handle);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(posted).toHaveLength(3);
    expect(posted.every((p) => p.id === handle && p.ms === 1000)).toBe(true);

    timers.clearBackgroundTimer(handle);
    expect(cancelled).toEqual([handle]);
    elapse(handle);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("lets an interval clear itself from its own callback", () => {
    const { timers, cancelled, elapse } = loadWithNative();
    let ticks = 0;
    const handle = timers.setBackgroundInterval(() => {
      ticks++;
      timers.clearBackgroundTimer(handle);
    }, 10);
    elapse(handle);
    elapse(handle);
    expect(ticks).toBe(1);
    expect(cancelled).toEqual([handle]);
  });

  it("keeps concurrent timers apart", async () => {
    const { timers, elapse } = loadWithNative();
    const settled: string[] = [];
    void timers.backgroundSleep(10).then(() => settled.push("first"));
    void timers.backgroundSleep(10).then(() => settled.push("second"));

    elapse(2);
    await flush();
    expect(settled).toEqual(["second"]);

    elapse(1);
    await flush();
    expect(settled).toEqual(["second", "first"]);
  });

  it("ignores a clear of null, undefined or an unknown handle", () => {
    const { timers, cancelled } = loadWithNative();
    timers.clearBackgroundTimer(null);
    timers.clearBackgroundTimer(undefined);
    timers.clearBackgroundTimer(999);
    expect(cancelled).toEqual([]);
  });
});

describe("backgroundTimer without the native module", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("falls back to JS timers", async () => {
    const timers = loadWithoutNative();
    const once = jest.fn();
    const every = jest.fn();
    const cleared = jest.fn();
    timers.setBackgroundTimeout(once, 100);
    const interval = timers.setBackgroundInterval(every, 50);
    timers.clearBackgroundTimer(timers.setBackgroundTimeout(cleared, 10));
    let slept = false;
    void timers.backgroundSleep(200).then(() => {
      slept = true;
    });

    jest.advanceTimersByTime(150);
    expect(once).toHaveBeenCalledTimes(1);
    expect(every).toHaveBeenCalledTimes(3);
    expect(cleared).not.toHaveBeenCalled();

    timers.clearBackgroundTimer(interval);
    jest.advanceTimersByTime(100);
    await flush();
    expect(every).toHaveBeenCalledTimes(3);
    expect(slept).toBe(true);
  });
});
