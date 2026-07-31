import { soulSyncRequest } from "@/services/soulsync";
import type {
  SoulSyncConfig,
  SoulSyncSystemStatus,
} from "@/services/soulsync/types";

// Verifies the server URL + API key by hitting /system/status. Throws on any
// failure (unreachable host, wrong key → 401/403); the caller surfaces a toast.
export async function testConnection(
  config: SoulSyncConfig,
): Promise<SoulSyncSystemStatus> {
  return soulSyncRequest<SoulSyncSystemStatus>("/system/status", { config });
}

export async function fetchSystemStatus(): Promise<SoulSyncSystemStatus> {
  return soulSyncRequest<SoulSyncSystemStatus>("/system/status");
}
