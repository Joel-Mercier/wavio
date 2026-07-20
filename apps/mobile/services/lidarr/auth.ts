import { lidarrRequest } from "@/services/lidarr/client";
import type { LidarrConfig, LidarrSystemStatus } from "@/services/lidarr/types";

// Verifies the server URL + API key by hitting /system/status. Throws on any
// failure (unreachable host, wrong key → 401); the caller surfaces a toast.
export async function testConnection(
  config: LidarrConfig,
): Promise<LidarrSystemStatus> {
  return lidarrRequest<LidarrSystemStatus>("/system/status", { config });
}
