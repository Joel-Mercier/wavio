import { createMMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

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

// Scope derivation lives in config/authScope.ts, kept free of native imports so
// tests and the migration helpers can use the real formula. Resolve the active
// session's scope with `currentAuthScope()` (stores/auth.ts).

// Logical key for the persisted React Query cache. The physical MMKV key is
// namespaced per (server, user) scope — see mmkvQueryPersisterStorage in
// config/queryClient.ts — so switching servers never bleeds another server's
// cached responses into the UI.
export const QUERY_CACHE_KEY = "wavio-rq-cache";

export const scopedQueryCacheKey = (scope: string) =>
  `${scope}:${QUERY_CACHE_KEY}`;
