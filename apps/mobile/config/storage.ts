import { AppState } from "react-native";
import { createMMKV } from "react-native-mmkv";
import type {
  PersistStorage,
  StateStorage,
  StorageValue,
} from "zustand/middleware";

export const storage = createMMKV({
  id: "wavio",
});

export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return storage.set(name, value);
  },
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.remove(name);
  },
};

export const createScopedStorage = (scope: string): StateStorage => ({
  setItem: (name, value) => {
    return storage.set(`${scope}:${name}`, value);
  },
  getItem: (name) => {
    const value = storage.getString(`${scope}:${name}`);
    return value ?? null;
  },
  removeItem: (name) => {
    return storage.remove(`${scope}:${name}`);
  },
});

// On a (server, user) switch the app resets every scoped store in memory before
// rehydrating it from the incoming scope's bucket. zustand's persist middleware
// writes on *every* `set`, so those resets would flush initial state into the
// incoming scope's key — destroying the very data the rehydrate that follows is
// about to read (rehydrate itself only reads, so it never gets it back). Writes
// are suspended for the duration of the reset pass instead; reads stay live.
let scopedWritesSuspended = false;

export const withScopedWritesSuspended = <T>(reset: () => T): T => {
  scopedWritesSuspended = true;
  try {
    return reset();
  } finally {
    scopedWritesSuspended = false;
  }
};

// Resolves the scope on every call so persisted stores follow the active
// server. createJSONStorage caches its storage instance, so a one-shot
// `createScopedStorage(scope)` snapshots whichever scope was active at
// middleware init — switching servers would then keep reading/writing the
// previous server's bucket.
export const createDynamicScopedStorage = (
  getScope: () => string,
): StateStorage => ({
  setItem: (name, value) => {
    if (scopedWritesSuspended) return;
    return storage.set(`${getScope()}:${name}`, value);
  },
  getItem: (name) => {
    const value = storage.getString(`${getScope()}:${name}`);
    return value ?? null;
  },
  removeItem: (name) => {
    if (scopedWritesSuspended) return;
    return storage.remove(`${getScope()}:${name}`);
  },
});

// zustand's persist middleware stringifies the whole partialized store on every
// `set`, which is ruinous for a store that holds thousands of entries and is
// written once per download event (issue #205). This coalesces those writes
// into one serialization per `delayMs`. The key is resolved when the write is
// *issued*, not when it lands, so a write pending across a server switch still
// goes to the scope it belongs to. Anything that enumerates or deletes raw keys
// must call flushPendingScopedWrites() first, or it sees a stale value / has a
// late flush write over it.
const pendingFlushers = new Set<() => void>();

export const flushPendingScopedWrites = () => {
  for (const flush of [...pendingFlushers]) flush();
};

let flushOnBackgroundRegistered = false;

const registerFlushOnBackground = () => {
  if (flushOnBackgroundRegistered) return;
  flushOnBackgroundRegistered = true;
  AppState.addEventListener("change", (status) => {
    if (status !== "active") flushPendingScopedWrites();
  });
};

// For writers outside this module that coalesce their own writes (the React
// Query persister), so the background flush and flushPendingScopedWrites()
// reach them too.
export const registerPendingFlusher = (flush: () => void): (() => void) => {
  registerFlushOnBackground();
  pendingFlushers.add(flush);
  return () => {
    pendingFlushers.delete(flush);
  };
};

export const createThrottledScopedJSONStorage = <S>(
  getScope: () => string,
  delayMs: number,
): PersistStorage<S> => {
  let pending: { key: string; value: StorageValue<S> } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    pendingFlushers.delete(flush);
    if (!pending) return;
    const { key, value } = pending;
    pending = null;
    storage.set(key, JSON.stringify(value));
  };

  registerFlushOnBackground();

  return {
    setItem: (name, value) => {
      if (scopedWritesSuspended) return;
      const key = `${getScope()}:${name}`;
      if (pending && pending.key !== key) flush();
      pending = { key, value };
      pendingFlushers.add(flush);
      if (!timer) timer = setTimeout(flush, delayMs);
    },
    getItem: (name) => {
      const key = `${getScope()}:${name}`;
      if (pending?.key === key) flush();
      const value = storage.getString(key);
      return value ? (JSON.parse(value) as StorageValue<S>) : null;
    },
    removeItem: (name) => {
      if (scopedWritesSuspended) return;
      const key = `${getScope()}:${name}`;
      if (pending?.key === key) pending = null;
      storage.remove(key);
    },
  };
};

// Scope derivation lives in config/authScope.ts, kept free of native imports so
// tests and the migration helpers can use the real formula. Resolve the active
// session's scope with `currentAuthScope()` (stores/auth.ts).

// The persisted React Query cache: one key per query,
// `<scope>:wavio-rq:<queryHash>` (see config/queryPersister.ts), namespaced per
// (server, user) so switching servers never bleeds another server's cached
// responses into the UI.
export const scopedQueryCachePrefix = (scope: string) => `${scope}:wavio-rq:`;

// When the scope's cache was last restored — what its 7-day expiry counts from.
export const scopedQueryCacheTouchedKey = (scope: string) =>
  `${scope}:wavio-rq-touched`;

// The single-blob layout the per-query keys replaced; migrated on first restore.
export const scopedLegacyQueryCacheKey = (scope: string) =>
  `${scope}:wavio-rq-cache`;
