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

// Resolves the scope on every call so persisted stores follow the active
// server. createJSONStorage caches its storage instance, so a one-shot
// `createScopedStorage(scope)` snapshots whichever scope was active at
// middleware init — switching servers would then keep reading/writing the
// previous server's bucket.
export const createDynamicScopedStorage = (
  getScope: () => string,
): StateStorage => ({
  setItem: (name, value) => {
    return storage.set(`${getScope()}:${name}`, value);
  },
  getItem: (name) => {
    const value = storage.getString(`${getScope()}:${name}`);
    return value ?? null;
  },
  removeItem: (name) => {
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
