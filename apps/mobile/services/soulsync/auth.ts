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
  return soulSyncRequest<SoulSyncSystemStatus>("/system/status", {
    config,
    unauthorizedIsExpected: true,
  });
}

// Polled by hooks/soulsync/useSoulSyncStatus while a connection is configured,
// so a stored key that was revoked (or was wrong all along) would otherwise file
// a 403 on every poll.
export async function fetchSystemStatus(): Promise<SoulSyncSystemStatus> {
  return soulSyncRequest<SoulSyncSystemStatus>("/system/status", {
    unauthorizedIsExpected: true,
  });
}
