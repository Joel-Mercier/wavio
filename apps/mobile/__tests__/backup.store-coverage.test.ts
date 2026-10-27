import fs from "node:fs";
import path from "node:path";
import {
  BACKUP_EXCLUDED_GLOBAL_KEYS,
  BACKUP_EXCLUDED_SCOPED_STORE_NAMES,
  BACKUP_SECRET_FIELDS,
  GLOBAL_KEYS,
  SCOPED_STORE_NAMES,
} from "@/services/backupStoreKeys";

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

type PersistedStore = {
  file: string;
  name: string;
  scoped: boolean;
  fields: string[];
};

// The fields a store persists: what its `partialize` reads off `state`, or,
// for a store that persists everything, the state interface's top-level
// properties (two-space indent).
function persistedFields(src: string): string[] {
  const start = src.indexOf("partialize:");
  if (start !== -1) {
    const end = src.indexOf("\n  )", start);
    const body = src.slice(start, end === -1 ? undefined : end);
    const fields = [...body.matchAll(/state\.(\w+)/g)].map((m) => m[1]);
    if (fields.length > 0) return [...new Set(fields)];
  }
  return [...new Set([...src.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]))];
}

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

    stores.push({
      file,
      name,
      scoped: usesScoped,
      fields: persistedFields(src),
    });
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
      .filter(
        (s) =>
          !(GLOBAL_KEYS as readonly string[]).includes(s.name) &&
          !(BACKUP_EXCLUDED_GLOBAL_KEYS as readonly string[]).includes(s.name),
      )
      .map((s) => `${s.name} (${s.file})`);
    expect(missing).toEqual([]);
  });

  // No password, token or API key may reach a backup file. A persisted field
  // whose name looks like a credential has to be stripped through
  // BACKUP_SECRET_FIELDS (or the store left out of backups entirely).
  it("strips every credential-looking field from a backup", () => {
    const SECRET_LIKE = /password|token|secret|api_?key|session_?key/i;
    // Names that match the pattern but hold no credential.
    const NOT_SECRET = new Set(["useTokenAuth", "plainPasswordAuth"]);
    // Sanitized field by field in services/backup.ts itself.
    const HANDLED_IN_BACKUP = new Set(["auth", "servers"]);
    const excluded = new Set<string>([
      ...BACKUP_EXCLUDED_GLOBAL_KEYS,
      ...BACKUP_EXCLUDED_SCOPED_STORE_NAMES,
    ]);
    const unstripped = stores
      .filter((s) => !excluded.has(s.name) && !HANDLED_IN_BACKUP.has(s.name))
      .flatMap((s) =>
        s.fields
          .filter((field) => SECRET_LIKE.test(field) && !NOT_SECRET.has(field))
          .filter((field) => !BACKUP_SECRET_FIELDS[s.name]?.includes(field))
          .map((field) => `${s.name}.${field} (${s.file})`),
      );
    expect(unstripped).toEqual([]);
  });

  it("checks the stores that do hold credentials", () => {
    // Guards the scanner above against passing vacuously.
    const withSecrets = stores.filter((s) =>
      s.fields.some((f) => BACKUP_SECRET_FIELDS[s.name]?.includes(f)),
    );
    expect(withSecrets.map((s) => s.name).sort()).toEqual(
      Object.keys(BACKUP_SECRET_FIELDS).sort(),
    );
  });
});
