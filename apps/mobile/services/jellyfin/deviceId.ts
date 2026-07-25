import { storage } from "@/config/storage";

const KEY = "jellyfin.deviceId";
const PREFIX = "wavio-";

const generateId = () =>
  `${PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function getDeviceId(): string {
  const existing = storage.getString(KEY);
  // Ids missing the prefix were seeded from the Android SSAID by earlier
  // builds; rotate them so no OS-level device identifier reaches the server.
  if (existing?.startsWith(PREFIX)) return existing;
  const id = generateId();
  storage.set(KEY, id);
  return id;
}
