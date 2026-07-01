import fs from "node:fs";
import path from "node:path";
import { GLOBAL_KEYS, SCOPED_STORE_NAMES } from "@/services/backupStoreKeys";

// Drift guard: every persisted zustand store must be covered by the backup
// lists in services/backup.ts, otherwise its data is silently dropped from
// export/restore. This scans the store sources (rather than importing them, to
// avoid pulling native modules) and asserts each persisted store's name appears
// in the matching list.
//
// Classification per file:
// - a store persists via `createDynamicScopedStorage` => scoped (key
//   `<scope>:<name>`), must be in SCOPED_STORE_NAMES.
// - a store persists via `zustandStorage` => global (key `<name>`), must be in
//   GLOBAL_KEYS.
// - the queue store hand-rolls persistence (`QUEUE_STORAGE_NAME`) instead of the
//   `persist` middleware, so it is matched separately.

const storesDir = path.join(__dirname, "..", "stores");

type PersistedStore = { file: string; name: string; scoped: boolean };

function persistName(src: string): string | null {
  // The persist config's `name:` is the last `name: "..."` before the
  // `storage:` line (data objects with a `name` field live in the state factory
  // above it; only `version`/`partialize` may sit between name and storage).
  const storageIdx = src.search(/storage:\s*createJSONStorage/);
  if (storageIdx === -1) return null;
  const before = src.slice(0, storageIdx);
  const matches = [...before.matchAll(/name:\s*"([^"]+)"/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

function discoverPersistedStores(): PersistedStore[] {
  const stores: PersistedStore[] = [];
  for (const file of fs.readdirSync(storesDir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const src = fs.readFileSync(path.join(storesDir, file), "utf8");

    const usesScoped = /createDynamicScopedStorage/.test(src);
    const usesGlobal = /zustandStorage/.test(src);
    if (!usesScoped && !usesGlobal) continue; // not a persisted store

    // Hand-rolled persistence (queue store) — no `persist` middleware config.
    const handRolled = src.match(/[A-Z_]*STORAGE_NAME\s*=\s*"([^"]+)"/);
    const name = persistName(src) ?? handRolled?.[1] ?? null;
    if (!name) continue;

    stores.push({ file, name, scoped: usesScoped });
  }
  return stores;
}

describe("backup store coverage", () => {
  const stores = discoverPersistedStores();

  it("finds the persisted stores to check", () => {
    // Guards against the scanner silently matching nothing (e.g. a refactor
    // that changes the storage helper names) and passing vacuously.
    expect(stores.length).toBeGreaterThanOrEqual(15);
  });

  it("lists every scoped store in SCOPED_STORE_NAMES", () => {
    const missing = stores
      .filter((s) => s.scoped)
      .filter(
        (s) => !(SCOPED_STORE_NAMES as readonly string[]).includes(s.name),
      )
      .map((s) => `${s.name} (${s.file})`);
    expect(missing).toEqual([]);
  });

  it("lists every global store in GLOBAL_KEYS", () => {
    const missing = stores
      .filter((s) => !s.scoped)
      .filter((s) => !(GLOBAL_KEYS as readonly string[]).includes(s.name))
      .map((s) => `${s.name} (${s.file})`);
    expect(missing).toEqual([]);
  });
});
