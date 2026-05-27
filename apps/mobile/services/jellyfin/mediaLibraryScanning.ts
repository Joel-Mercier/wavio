import jellyfinApiInstance from "@/services/jellyfin/index";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { ScanStatus } from "@/services/openSubsonic/types";

export const getScanStatus = async () => {
  // Jellyfin exposes /ScheduledTasks. The library refresh task name is
  // "RefreshLibraryTask" but reporting accurately requires admin scope.
  // Default to not scanning; UI consumers will simply not show progress.
  const scanStatus: ScanStatus = { scanning: false };
  return fakeEnvelope({ scanStatus });
};

export const startScan = async () => {
  await jellyfinApiInstance.post("/Library/Refresh");
  const scanStatus: ScanStatus = { scanning: true };
  return fakeEnvelope({ scanStatus });
};
