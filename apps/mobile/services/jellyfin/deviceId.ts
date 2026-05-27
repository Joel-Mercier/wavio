import * as Application from "expo-application";
import { storage } from "@/config/storage";

const KEY = "jellyfin.deviceId";

const generateId = () =>
  `wavio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function getDeviceId(): string {
  const existing = storage.getString(KEY);
  if (existing) return existing;
  const native =
    Application.getAndroidId?.() ?? Application.getIosIdForVendorAsync;
  // We cannot await an async call here; fall back to a generated id and let
  // it be persisted. Native ids would only help with server-side dedup; for
  // Jellyfin session purposes a stable random id is fine.
  const id = typeof native === "string" && native ? native : generateId();
  storage.set(KEY, id);
  return id;
}
