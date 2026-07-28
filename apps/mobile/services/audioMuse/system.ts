import axios from "axios";
import { audioMuseRequest } from "@/services/audioMuse";
import {
  getFingerprintDefaults,
  resolveFingerprintDefaultUser,
  resolveFingerprintServerType,
} from "@/services/audioMuse/fingerprint";
import type {
  AudioMuseArtistSearchResult,
  AudioMuseCacheStats,
  AudioMuseChatDefaults,
  AudioMuseConfig,
  AudioMuseDashboardSummary,
  AudioMuseHealth,
  AudioMuseSemGroveStats,
  AudioMuseServerConfig,
  AudioMuseServersResponse,
} from "@/services/audioMuse/types";
import type { AudioMuseFeatures } from "@/stores/audioMuse";

export class AudioMuseUnreachableError extends Error {
  constructor() {
    super("AudioMuse-AI did not answer its health probe");
    this.name = "AudioMuseUnreachableError";
  }
}

export class AudioMuseUnauthorizedError extends Error {
  constructor() {
    super("AudioMuse-AI rejected the API token");
    this.name = "AudioMuseUnauthorizedError";
  }
}

function isUnauthorized(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

// Reachability only. /api/health is the one path AudioMuse exempts from its auth
// barrier (`request.path == '/api/health'` returns before check_auth_needed), so
// it answers "ok" to an empty or wrong token too — it can never stand in for an
// authentication check. An instance still on its first-run wizard redirects to
// an HTML page instead, which is why the body is checked, not just the status.
async function assertReachable(config: AudioMuseConfig): Promise<void> {
  const rsp = await audioMuseRequest<AudioMuseHealth>("/api/health", {
    config,
    skipServerScope: true,
  });
  if (rsp?.status !== "ok") {
    throw new AudioMuseUnreachableError();
  }
}

// Connect = reachable, then authenticated. The token is only ever proven by a
// gated endpoint, so probeFeatures is what validates it: any 401/403 from those
// calls means the token is wrong and the connection must fail rather than
// present itself as connected with every feature mysteriously off.
export async function connect(
  config: AudioMuseConfig,
): Promise<Partial<AudioMuseFeatures>> {
  await assertReachable(config);
  return probeFeatures(config);
}

// AudioMuse deployments are configurable: the CLAP and lyrics indexes are
// opt-in and the AI provider can be NONE, so the app asks what this one can do
// and only offers those surfaces. Probes are independent — a deployment that
// 404s on one still yields a usable connection, so that failure degrades the
// single feature to "unavailable". A rejected token is the exception: it fails
// every probe, so it is raised rather than mistaken for a featureless server.
export async function probeFeatures(
  config: AudioMuseConfig,
): Promise<Partial<AudioMuseFeatures>> {
  const [
    chatDefaults,
    serverConfig,
    clapStats,
    lyricsStats,
    servers,
    summary,
    fingerprintDefaults,
    artistSearch,
    semGroveStats,
  ] = await Promise.all([
    settled(() =>
      audioMuseRequest<AudioMuseChatDefaults>("/chat/api/config_defaults", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    settled(() =>
      audioMuseRequest<AudioMuseServerConfig>("/api/config", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    settled(() =>
      audioMuseRequest<AudioMuseCacheStats>("/api/clap/stats", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    settled(() =>
      audioMuseRequest<AudioMuseCacheStats>("/api/lyrics/stats", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    settled(() =>
      audioMuseRequest<AudioMuseServersResponse>("/api/servers", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    // How much of the library AudioMuse has actually analysed. An unanalysed
    // deployment answers every search and every prompt with nothing, which is
    // indistinguishable from a bad query unless the app knows the catalogue is
    // empty — see selectEmptyReason.
    settled(() =>
      audioMuseRequest<AudioMuseDashboardSummary>("/api/dashboard/summary", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    // Served by the sonic-fingerprint blueprint, so answering at all is what
    // proves the deployment has the feature. The one probe that must stay
    // server-scoped: it reports the *selected* media server's type and default
    // account, which is what the credential form renders from.
    settled(() => getFingerprintDefaults(config)),
    // Answering at all proves the artist-similarity blueprint is mounted, which
    // older deployments 404 on. /api/search_artists is the probe rather than
    // /api/similar_artists because it needs no seed artist and reads the
    // analysed-track table, so it answers whatever state the artist index is in.
    // The flip side is that this cannot tell a built index from an unbuilt one —
    // that only shows up as a 503 when the artist screen actually queries, which
    // findSimilarArtists folds into an empty row.
    settled(() =>
      audioMuseRequest<AudioMuseArtistSearchResult[]>("/api/search_artists", {
        config,
        params: { query: "a", start: 0, end: 1 },
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
    // Whether the *merged* lyrics+audio index a lyrics path walks is loaded.
    // Deliberately not /api/lyrics/stats above: that one describes the
    // text-search index, and a deployment can have it warm while this one was
    // never built. Unlike the other probes this reads a runtime cache rather
    // than a config flag, so it can flip back to false after a restart until
    // the worker warms up — hence it only gates an option, never the feature.
    settled(() =>
      audioMuseRequest<AudioMuseSemGroveStats>("/api/sem_grove/stats", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
  ]);

  return {
    clapEnabled: clapStats?.clap_enabled === true,
    lyricsEnabled: lyricsStats?.lyrics_enabled === true,
    // The deployment's *default* provider only. A prompt call may name another
    // one, so this is a starting point for the picker rather than a verdict on
    // whether prompt playlists work — see selectAiProvider. The chat blueprint's
    // own defaults win because that is what its endpoints fall back to;
    // /api/config exposes the same value for deployments not mounting it.
    aiProvider:
      chatDefaults?.default_ai_provider ??
      serverConfig?.ai_model_provider ??
      null,
    analyzedTrackCount: countOrNull(summary?.content?.total_songs),
    clapIndexedCount: countOrNull(summary?.content?.clap_indexed),
    moodLabels: parseMoodLabels(serverConfig?.mood_labels),
    fingerprintEnabled: !!fingerprintDefaults,
    artistSimilarityEnabled: artistSearch !== null,
    semGroveEnabled: semGroveStats?.loaded === true,
    fingerprintServerType: resolveFingerprintServerType(fingerprintDefaults),
    fingerprintDefaultUser: resolveFingerprintDefaultUser(fingerprintDefaults),
    availableServers: (servers?.servers ?? [])
      .filter((server) => !!server.server_id)
      .map((server) => ({
        id: server.server_id,
        name: server.name || server.server_id,
        isDefault: server.is_default === true,
      })),
  };
}

// AudioMuse publishes a null for any snapshot count whose query failed, so a
// missing or non-numeric value has to stay "unknown" rather than collapse to 0 —
// a 0 is what tells the app the library was never scanned.
function countOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function settled<T>(request: () => Promise<T>): Promise<T | null> {
  try {
    return await request();
  } catch (error) {
    if (isUnauthorized(error)) throw new AudioMuseUnauthorizedError();
    return null;
  }
}

// MOOD_LABELS is a config value the setup wizard writes, so it comes back as a
// list on modern deployments and as a comma-separated string on older ones.
function parseMoodLabels(labels: string[] | string | undefined): string[] {
  if (Array.isArray(labels)) return labels;
  if (typeof labels === "string") {
    return labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
  }
  return [];
}
