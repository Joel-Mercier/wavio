import { MMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

export const storage = new MMKV({
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
    return storage.delete(name);
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
    return storage.delete(`${scope}:${name}`);
  },
});

export const getAuthScope = (url: string, username: string) => {
  const safeUrl = url.replace(/[^a-zA-Z0-9]/g, "_");
  const safeUsername = username.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeUrl}_${safeUsername}`;
};
