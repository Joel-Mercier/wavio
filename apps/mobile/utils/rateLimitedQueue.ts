const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AbortedError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortedError";
  }
}

export type RateLimitedQueue = {
  run: <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T>;
  /** Tasks queued but not yet finished — drives progress UI. */
  pending: () => number;
};

/**
 * Serializes tasks and spaces their *starts* by at least `minIntervalMs`.
 *
 * Written for APIs that enforce a hard request budget rather than returning 429s
 * — MusicBrainz allows one call per second per client and blocks the IP of
 * clients that exceed it, so throttling has to be pre-emptive, not reactive.
 * `jitterMs` spreads bursts so several app instances don't land in lockstep.
 */
export function createRateLimitedQueue({
  minIntervalMs,
  jitterMs = 0,
}: {
  minIntervalMs: number;
  jitterMs?: number;
}): RateLimitedQueue {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;
  let pending = 0;

  return {
    run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      pending++;
      const result = chain.then(async () => {
        try {
          // Checked once the slot comes up rather than at enqueue time, so a
          // cancelled scan drains its backlog without spending rate budget.
          if (signal?.aborted) throw new AbortedError();
          const jitter = jitterMs > 0 ? Math.random() * jitterMs : 0;
          const wait = lastStartedAt + minIntervalMs + jitter - Date.now();
          if (wait > 0) await sleep(wait);
          if (signal?.aborted) throw new AbortedError();
          lastStartedAt = Date.now();
          return await task();
        } finally {
          pending--;
        }
      });
      // The chain must survive a rejected task, or one failure would poison
      // every subsequent call.
      chain = result.catch(() => undefined);
      return result;
    },
    pending: () => pending,
  };
}
