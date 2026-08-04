// The waveform cache is what stops a track being decoded twice, so the cases
// worth pinning are the ones that decide "decode again or not": a hit, a
// replaced local file, and the difference between a codec that will never work
// and a server that was briefly unreachable.

type Row = {
  id: string;
  peaks: Uint8Array | null;
  bucket_count: number;
  duration_ms: number;
  status: string;
  fingerprint: string | null;
  version: number;
  attempts: number;
  created_at: number;
  last_used_at: number;
};

// A hand-rolled stand-in for the handful of SQL statements cache.ts issues,
// keyed off the shape of each query rather than a real SQLite engine.
const mockDb = {
  rows: new Map<string, Row>(),
  async getFirstAsync(_sql: string, params: unknown[]) {
    const [id, version] = params as [string, number];
    const row = mockDb.rows.get(id);
    if (!row || row.version !== version) return null;
    return row;
  },
  async runAsync(sql: string, params: unknown[]) {
    if (sql.startsWith("DELETE FROM waveforms WHERE status")) {
      const failed = sql.startsWith("DELETE FROM waveforms WHERE status = ");
      const limit = params[0] as number;
      const scope = [...mockDb.rows.values()].filter(
        (r) => (r.status === "failed") === failed,
      );
      const keep = new Set(
        scope
          .sort((a, b) =>
            failed
              ? b.created_at - a.created_at
              : b.last_used_at - a.last_used_at,
          )
          .slice(0, limit)
          .map((r) => r.id),
      );
      for (const row of scope) {
        if (!keep.has(row.id)) mockDb.rows.delete(row.id);
      }
      return;
    }
    if (sql.startsWith("DELETE FROM waveforms WHERE id =")) {
      mockDb.rows.delete(params[0] as string);
      return;
    }
    if (sql.startsWith("DELETE FROM waveforms")) {
      mockDb.rows.clear();
      return;
    }
    if (sql.startsWith("UPDATE waveforms SET last_used_at")) {
      const [lastUsedAt, id] = params as [number, string];
      const row = mockDb.rows.get(id);
      if (row) row.last_used_at = lastUsedAt;
      return;
    }
    if (sql.startsWith("INSERT OR REPLACE INTO waveforms")) {
      const [
        id,
        peaks,
        bucketCount,
        durationMs,
        fingerprint,
        version,
        createdAt,
        lastUsedAt,
      ] = params as [
        string,
        Uint8Array,
        number,
        number,
        string | null,
        number,
        number,
        number,
      ];
      mockDb.rows.set(id, {
        id,
        peaks,
        bucket_count: bucketCount,
        duration_ms: durationMs,
        status: "ok",
        fingerprint,
        version,
        attempts: 0,
        created_at: createdAt,
        last_used_at: lastUsedAt,
      });
      return;
    }
    if (sql.trimStart().startsWith("INSERT INTO waveforms")) {
      const [id, fingerprint, version, createdAt, lastUsedAt] = params as [
        string,
        string | null,
        number,
        number,
        number,
      ];
      const existing = mockDb.rows.get(id);
      mockDb.rows.set(id, {
        id,
        peaks: null,
        bucket_count: 0,
        duration_ms: 0,
        status: "failed",
        fingerprint,
        version,
        attempts: (existing?.attempts ?? 0) + 1,
        created_at: existing?.created_at ?? createdAt,
        last_used_at: lastUsedAt,
      });
      return;
    }
    throw new Error(`unhandled SQL: ${sql}`);
  },
};

jest.mock("@/services/local/db", () => ({
  getLocalLibraryDb: async () => mockDb,
}));

jest.mock("@/utils/log", () => ({ logError: () => {} }));

import {
  __resetPruneGuard,
  clearWaveforms,
  pruneWaveforms,
  readWaveform,
  writeWaveform,
  writeWaveformFailure,
} from "@/services/waveform/cache";

const DAY_MS = 24 * 60 * 60 * 1000;
const peaks = () => Uint8Array.from([1, 2, 3, 4]);

beforeEach(() => {
  mockDb.rows.clear();
  __resetPruneGuard();
  jest.useRealTimers();
});

describe("readWaveform", () => {
  it("reports a miss when nothing is stored", async () => {
    expect(await readWaveform("a", null)).toBe("pending");
  });

  it("round-trips peaks and duration", async () => {
    await writeWaveform("a", peaks(), 187_500, null);
    const result = await readWaveform("a", null);
    expect(result).not.toBe("pending");
    if (result === "pending" || result === "skip")
      throw new Error("expected a hit");
    expect(Array.from(result.peaks)).toEqual([1, 2, 3, 4]);
    expect(result.durationMs).toBe(187_500);
  });

  it("ignores a row written by an older algorithm version", async () => {
    await writeWaveform("a", peaks(), 1000, null);
    const row = mockDb.rows.get("a");
    if (row) row.version = 0;
    expect(await readWaveform("a", null)).toBe("pending");
  });

  it("discards a local file whose bytes changed under a stable id", async () => {
    await writeWaveform("a", peaks(), 1000, "4096:111");
    expect(await readWaveform("a", "9999:222")).toBe("pending");
    // The stale row is dropped, not left to be re-checked forever.
    expect(mockDb.rows.has("a")).toBe(false);
  });

  it("keeps a local file whose fingerprint still matches", async () => {
    await writeWaveform("a", peaks(), 1000, "4096:111");
    expect(await readWaveform("a", "4096:111")).not.toBe("pending");
  });
});

describe("failures", () => {
  it("never retries a permanently undecodable track", async () => {
    await writeWaveformFailure("a", null, true);
    expect(await readWaveform("a", null)).toBe("skip");

    // Even far in the future, an unsupported codec is still unsupported.
    jest.useFakeTimers().setSystemTime(Date.now() + 3650 * DAY_MS);
    expect(await readWaveform("a", null)).toBe("skip");
  });

  it("holds off a transient failure, then retries it", async () => {
    await writeWaveformFailure("a", null, false);
    expect(await readWaveform("a", null)).toBe("skip");

    jest.useFakeTimers().setSystemTime(Date.now() + DAY_MS + 1000);
    expect(await readWaveform("a", null)).toBe("pending");
  });

  it("counts repeated attempts", async () => {
    await writeWaveformFailure("a", null, false);
    await writeWaveformFailure("a", null, false);
    expect(mockDb.rows.get("a")?.attempts).toBe(2);
  });

  it("lets a successful decode replace a stored failure", async () => {
    await writeWaveformFailure("a", null, false);
    await writeWaveform("a", peaks(), 1000, null);
    const result = await readWaveform("a", null);
    if (result === "pending" || result === "skip")
      throw new Error("expected a hit");
    expect(Array.from(result.peaks)).toEqual([1, 2, 3, 4]);
  });
});

describe("pruneWaveforms", () => {
  it("keeps the most recently used rows and runs once per session", async () => {
    for (let i = 0; i < 5200; i++) {
      mockDb.rows.set(`t${i}`, {
        id: `t${i}`,
        peaks: peaks(),
        bucket_count: 4,
        duration_ms: 1000,
        status: "ok",
        fingerprint: null,
        version: 1,
        attempts: 0,
        created_at: i,
        last_used_at: i,
      });
    }
    await pruneWaveforms();
    expect(mockDb.rows.size).toBe(5000);
    // Oldest gone, newest kept.
    expect(mockDb.rows.has("t0")).toBe(false);
    expect(mockDb.rows.has("t5199")).toBe(true);

    // A second call in the same session is a no-op, so a long queue doesn't
    // re-run the scan on every track.
    mockDb.rows.set("extra", {
      id: "extra",
      peaks: peaks(),
      bucket_count: 4,
      duration_ms: 1000,
      status: "ok",
      fingerprint: null,
      version: 1,
      attempts: 0,
      created_at: 0,
      last_used_at: 0,
    });
    await pruneWaveforms();
    expect(mockDb.rows.size).toBe(5001);
  });

  it("never lets failure rows evict real waveforms", async () => {
    // A permanent failure is dated a century ahead so its back-off can't expire,
    // which would also make it outrank every real row in a shared eviction.
    for (let i = 0; i < 1200; i++) {
      await writeWaveformFailure(`bad${i}`, null, true);
    }
    for (let i = 0; i < 4000; i++) {
      await writeWaveform(`t${i}`, peaks(), 1000, null);
    }

    await pruneWaveforms();

    for (let i = 0; i < 4000; i++) {
      expect(mockDb.rows.has(`t${i}`)).toBe(true);
    }
    const failed = [...mockDb.rows.values()].filter(
      (r) => r.status === "failed",
    );
    expect(failed).toHaveLength(1000);
  });
});

describe("clearWaveforms", () => {
  it("empties the table", async () => {
    await writeWaveform("a", peaks(), 1000, null);
    await clearWaveforms();
    expect(mockDb.rows.size).toBe(0);
  });
});
