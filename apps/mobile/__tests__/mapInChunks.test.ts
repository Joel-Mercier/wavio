import { mapInChunks } from "@/utils/mapInChunks";

describe("mapInChunks", () => {
  it("maps every item and preserves input order", async () => {
    const items = Array.from({ length: 1234 }, (_, i) => i);
    const out = await mapInChunks(items, 500, (n, index) => n * 10 + index);
    expect(out).toHaveLength(1234);
    expect(out[0]).toBe(0);
    expect(out[1233]).toBe(1233 * 11);
  });

  it("yields to the event loop between chunks, not within one", async () => {
    const ticks: number[] = [];
    let tick = 0;
    const timer = setInterval(() => {
      tick++;
    }, 0);
    await mapInChunks(
      Array.from({ length: 30 }, (_, i) => i),
      10,
      () => {
        ticks.push(tick);
      },
    );
    clearInterval(timer);
    // Three chunks: the first runs synchronously, each later one after a yield.
    expect(new Set(ticks.slice(0, 10)).size).toBe(1);
    expect(ticks[10]).toBeGreaterThan(ticks[9]);
    expect(ticks[20]).toBeGreaterThan(ticks[19]);
  });

  it("yields through a caller-supplied function when given one", async () => {
    // Car code passes a yield that doesn't depend on JS timers firing.
    const yieldFn = jest.fn(async () => {});
    const out = await mapInChunks([1, 2, 3, 4, 5], 2, (n) => n * 2, yieldFn);
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(yieldFn).toHaveBeenCalledTimes(2);
  });

  it("handles an empty list", async () => {
    expect(await mapInChunks([], 500, (n: number) => n)).toEqual([]);
  });
});
