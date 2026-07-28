import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMuseConfig,
  AudioMuseFingerprintDefaults,
  AudioMuseTrack,
} from "@/services/audioMuse/types";
import { useAudioMuseBase } from "@/stores/audioMuse";

// Sonic fingerprint: AudioMuse averages the embeddings of the user's 20
// most-played tracks (weighted by how recently they were played) and returns the
// nearest tracks to that centroid. The seeds themselves come back first, at
// distance 0, and count against `n` — so a small `n` is mostly songs the user
// already plays, which is why the floor is well above zero.
export const FINGERPRINT_MIN_RESULTS = 40;
export const FINGERPRINT_MAX_RESULTS = 1000;
export const FINGERPRINT_DEFAULT_RESULTS = 200;

// Reading the play history means AudioMuse calls the media server, then runs a
// vector search over the whole index; both are far past the instance-wide 15s
// reachability budget.
const FINGERPRINT_TIMEOUT_MS = 120_000;

/**
 * What the credential form must render, and which account to pre-fill. Served by
 * the sonic-fingerprint blueprint itself, so a 404 (null here) is exactly "this
 * deployment doesn't have the feature" — there is no separate capability flag.
 */
export async function getFingerprintDefaults(
  config?: AudioMuseConfig,
): Promise<AudioMuseFingerprintDefaults> {
  return audioMuseRequest<AudioMuseFingerprintDefaults>(
    "/api/config/defaults",
    {
      config,
      // Probed alongside the other feature checks, where a 404 is an older
      // deployment and a 401 is the token being validated — neither is a bug.
      notFoundIsExpected: true,
      unauthorizedIsExpected: true,
    },
  );
}

/**
 * The media server AudioMuse profiles, which decides which credentials the
 * generate call needs. `server_type` is only published from AudioMuse 3.0.0; on
 * older deployments the account key is the only signal, and a body with neither
 * means the type takes no per-user credentials at all (Lyrion, Plex).
 */
export function resolveFingerprintServerType(
  defaults: AudioMuseFingerprintDefaults | null,
): string | null {
  if (!defaults) return null;
  const declared = defaults.server_type?.trim();
  if (declared) return declared.toLowerCase();
  if (defaults.default_user_id) return "jellyfin";
  if (defaults.default_user) return "navidrome";
  return null;
}

/** The account AudioMuse would use by default, whichever key it published it under. */
export function resolveFingerprintDefaultUser(
  defaults: AudioMuseFingerprintDefaults | null,
): string | null {
  return defaults?.default_user_id || defaults?.default_user || null;
}

/** Which credential fields the generate call carries, per media-server type. */
function credentialFields(): Record<string, string> {
  const { fingerprintServerType, fingerprintUser, fingerprintSecret } =
    useAudioMuseBase.getState();
  const user = fingerprintUser.trim();
  const secret = fingerprintSecret.trim();

  // Emby shares Jellyfin's request fields and user-resolution flow.
  if (
    fingerprintServerType === "jellyfin" ||
    fingerprintServerType === "emby"
  ) {
    return {
      ...(user ? { jellyfin_user_identifier: user } : {}),
      ...(secret ? { jellyfin_token: secret } : {}),
    };
  }
  if (fingerprintServerType === "navidrome") {
    return {
      ...(user ? { navidrome_user: user } : {}),
      ...(secret ? { navidrome_password: secret } : {}),
    };
  }
  // Lyrion, Plex and pre-3.0.0 deployments that wouldn't name their type: the
  // endpoint takes no per-user credentials and profiles its own account.
  return {};
}

export function clampFingerprintResults(count: number): number {
  if (!Number.isFinite(count)) return FINGERPRINT_DEFAULT_RESULTS;
  return Math.min(
    FINGERPRINT_MAX_RESULTS,
    Math.max(FINGERPRINT_MIN_RESULTS, Math.round(count)),
  );
}

// Unlike the prompt playlist there is no streaming variant, so this is a single
// POST the caller can only cancel. The response is a bare array rather than the
// `{ results }` envelope the search endpoints use.
export async function generateSonicFingerprint({
  numResults,
  signal,
}: {
  numResults: number;
  signal?: AbortSignal;
}): Promise<AudioMuseTrack[]> {
  const rsp = await audioMuseRequest<AudioMuseTrack[]>(
    "/api/sonic_fingerprint/generate",
    {
      method: "post",
      data: { n: clampFingerprintResults(numResults), ...credentialFields() },
      timeout: FINGERPRINT_TIMEOUT_MS,
      signal,
    },
  );
  return Array.isArray(rsp) ? rsp : [];
}
