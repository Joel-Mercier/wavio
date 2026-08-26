import { tidarrRequest } from "@/services/tidarr";
import type { TidarrConfig, TidarrSettings } from "@/services/tidarr/types";

export class NotATidarrInstanceError extends Error {
  constructor() {
    super("Response does not look like a Tidarr instance");
    this.name = "NotATidarrInstanceError";
  }
}

function assertTidarrSettings(settings: TidarrSettings | undefined) {
  // A wrong host can answer 200 with anything at all; only a body carrying
  // Tidarr's own config blocks proves we reached Tidarr.
  if (!settings?.parameters && !settings?.tiddl_config) {
    throw new NotATidarrInstanceError();
  }
}

// Verifies the server URL + optional API key by hitting /api/settings, which
// doubles as the source of the instance's country code, default quality and
// Tidal-token state. Throws on any failure; the caller surfaces a toast.
export async function testConnection(
  config: TidarrConfig,
): Promise<TidarrSettings> {
  const settings = await tidarrRequest<TidarrSettings>("/settings", {
    config,
    unauthorizedIsExpected: true,
  });
  assertTidarrSettings(settings);
  return settings;
}

export async function fetchSettings(): Promise<TidarrSettings> {
  return tidarrRequest<TidarrSettings>("/settings", {
    // Same call as testConnection, just re-read in the background: a rejected
    // key means the stored one went stale, which the user fixes in settings.
    unauthorizedIsExpected: true,
  });
}
