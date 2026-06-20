import { mapWithConcurrency } from "@/utils/mapWithConcurrency";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("mapWithConcurrency", () => {
  it("maps every item and preserves input order", async () => {
    const out = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 10,
    );
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const gates = Array.from({ length: 10 }, deferred);
    const items = Array.from({ length: 10 }, (_, i) => i);

    const run = mapWithConcurrency(items, 3, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gates[i].promise;
      inFlight--;
      return i;
    });

    // Let the pool start; only `limit` tasks should be running.
    await Promise.resolve();
    expect(inFlight).toBe(3);

    // Release tasks one at a time; the pool refills but stays capped.
    for (const g of gates) {
      g.resolve();
      await Promise.resolve();
    }
    await run;
    expect(peak).toBe(3);
  });

  it("passes the index to the task", async () => {
    const out = await mapWithConcurrency(
      ["a", "b", "c"],
      2,
      async (v, i) => `${v}${i}`,
    );
    expect(out).toEqual(["a0", "b1", "c2"]);
  });

  it("handles an empty input without spawning workers", async () => {
    const task = jest.fn();
    const out = await mapWithConcurrency([], 4, task);
    expect(out).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });
});
