import { AbortedError, createRateLimitedQueue } from "@/utils/rateLimitedQueue";

// Real timers with a short interval: the queue's contract is about wall-clock
// spacing, and faking timers here would test the mock rather than the spacing.
const INTERVAL = 60;

describe("createRateLimitedQueue", () => {
  it("spaces task starts by at least the minimum interval", async () => {
    const queue = createRateLimitedQueue({ minIntervalMs: INTERVAL });
    const starts: number[] = [];

    await Promise.all(
      [0, 1, 2].map(() =>
        queue.run(async () => {
          starts.push(Date.now());
        }),
      ),
    );

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(INTERVAL - 5);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(INTERVAL - 5);
  });

  it("runs tasks in the order they were queued", async () => {
    const queue = createRateLimitedQueue({ minIntervalMs: 1 });
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map((n) =>
        queue.run(async () => {
          order.push(n);
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3]);
  });

  it("keeps serving later tasks after one rejects", async () => {
    const queue = createRateLimitedQueue({ minIntervalMs: 1 });

    const failed = queue.run(async () => {
      throw new Error("boom");
    });
    const succeeded = queue.run(async () => "ok");

    await expect(failed).rejects.toThrow("boom");
    await expect(succeeded).resolves.toBe("ok");
  });

  it("skips an aborted task without spending its interval", async () => {
    const queue = createRateLimitedQueue({ minIntervalMs: INTERVAL });
    const controller = new AbortController();
    controller.abort();

    const ran = jest.fn();
    await expect(
      queue.run(async () => ran(), controller.signal),
    ).rejects.toBeInstanceOf(AbortedError);
    expect(ran).not.toHaveBeenCalled();
  });

  it("reports how many tasks are still outstanding", async () => {
    const queue = createRateLimitedQueue({ minIntervalMs: 1 });
    expect(queue.pending()).toBe(0);

    const inFlight = Promise.all([
      queue.run(async () => undefined),
      queue.run(async () => undefined),
    ]);
    expect(queue.pending()).toBe(2);

    await inFlight;
    expect(queue.pending()).toBe(0);
  });
});
