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
  AudioMuseFingerprintDefaults,
  AudioMuseHealth,
  AudioMuseModels,
  AudioMuseSemGroveStats,
  AudioMuseServerConfig,
  AudioMuseServersResponse,
  AudioMuseVersion,
} from "@/services/audioMuse/types";
import type { AudioMuseFeatures } from "@/stores/audioMuse";
import { gte, parseServerVersion, type SemVer } from "@/utils/navidromeVersion";

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

// The first release serving /api/version, and /api/models alongside it.
export const VERSION_ENDPOINT_MIN: SemVer = [3, 6, 2];

/**
 * What /api/version reports, or null on a deployment older than 3.6.2 that has
 * no such endpoint. Behind the auth barrier, so a 401 here is a rejected token.
 */
export async function getServerVersion(
  config: AudioMuseConfig,
): Promise<string | null> {
  try {
    const rsp = await audioMuseRequest<AudioMuseVersion>("/api/version", {
      config,
      skipServerScope: true,
      unauthorizedIsExpected: true,
      notFoundIsExpected: true,
    });
    return rsp?.app_version?.trim() || null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// AudioMuse deployments are configurable: the CLAP and lyrics indexes are
// opt-in and the AI provider can be NONE, so the app asks what this one can do
// and only offers those surfaces. Probes are independent — a deployment that
// 404s on one still yields a usable connection, so that failure degrades the
// single feature to "unavailable". A rejected token is the exception: it fails
// every probe, so it is raised rather than mistaken for a featureless server.
//
// The version decides how much has to be probed at all. A deployment that names
// it is recent enough to carry every blueprint the app uses, and reports its
// models directly; only deployment *configuration* (AI provider, mood labels,
// indexes built, analysed counts) still has to be asked for. An older one has no
// version endpoint, so its blueprints are discovered by which probes answer.
export async function probeFeatures(
  config: AudioMuseConfig,
): Promise<Partial<AudioMuseFeatures>> {
  const serverVersion = await settled(() => getServerVersion(config));
  const versioned = gte(
    parseServerVersion(serverVersion),
    VERSION_ENDPOINT_MIN,
  );

  const [
    chatDefaults,
    serverConfig,
    servers,
    summary,
    fingerprintDefaults,
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
    // Server-scoped: it reports the *selected* media server's type and default
    // account, which is what the fingerprint credential form renders from. On an
    // unversioned deployment answering at all is also what proves the feature.
    settled(() => getFingerprintDefaults(config)),
    // Whether the *merged* lyrics+audio index a lyrics path walks is loaded.
    // Deliberately not the lyrics text-search state: a deployment can have that
    // one warm while this one was never built. Unlike the other probes this reads
    // a runtime cache rather than a config flag, so it can flip back to false
    // after a restart until the worker warms up — hence it only gates an option,
    // never the feature.
    settled(() =>
      audioMuseRequest<AudioMuseSemGroveStats>("/api/sem_grove/stats", {
        config,
        skipServerScope: true,
        unauthorizedIsExpected: true,
        notFoundIsExpected: true,
      }),
    ),
  ]);

  const shared: Partial<AudioMuseFeatures> = {
    serverVersion,
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

  return {
    ...shared,
    ...(versioned
      ? await probeVersionedFeatures(config)
      : await probeUnversionedFeatures(config, fingerprintDefaults)),
  };
}

// One call replaces the per-index stats probes: /api/models names every model
// and whether it runs, and is scoped to the selected media server so the
// fingerprint coverage is the one this app can actually match against.
async function probeVersionedFeatures(
  config: AudioMuseConfig,
): Promise<Partial<AudioMuseFeatures>> {
  const rsp = await settled(() =>
    audioMuseRequest<AudioMuseModels>("/api/models", {
      config,
      unauthorizedIsExpected: true,
    }),
  );
  const models = rsp?.models ?? {};
  const neural = models["neural-fingerprint"];
  return {
    clapEnabled: models.clap?.enabled === true,
    lyricsEnabled: models.lyrics?.enabled === true,
    fingerprintEnabled: true,
    artistSimilarityEnabled: true,
    recordingSearchEnabled: neural?.enabled === true,
    neuralIndexedCount: countOrNull(
      neural?.local?.count ?? neural?.global?.count,
    ),
  };
}

// Deployments older than 3.6.2 say nothing about themselves, so each blueprint
// is discovered by whether its probe answers. Search by recording is never
// offered here: the only way to learn whether a 3.6.0/3.6.1 deployment runs the
// model is its warmup call, which loads that model as a side effect.
async function probeUnversionedFeatures(
  config: AudioMuseConfig,
  fingerprintDefaults: AudioMuseFingerprintDefaults | null,
): Promise<Partial<AudioMuseFeatures>> {
  const [clapStats, lyricsStats, artistSearch] = await Promise.all([
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
  ]);
  return {
    clapEnabled: clapStats?.clap_enabled === true,
    lyricsEnabled: lyricsStats?.lyrics_enabled === true,
    fingerprintEnabled: !!fingerprintDefaults,
    artistSimilarityEnabled: artistSearch !== null,
    recordingSearchEnabled: false,
    neuralIndexedCount: null,
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
