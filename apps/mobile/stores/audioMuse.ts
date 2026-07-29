import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// AudioMuse-AI connection, persisted per (server, user): an AudioMuse deployment
// analyses one specific media library, so its URL, token and server selection are
// only meaningful for the music server they were configured against. The API
// token is a credential, another reason to keep it scoped.

export interface AudioMuseServer {
  id: string;
  name: string;
  isDefault: boolean;
}

// Feature availability discovered on connect. AudioMuse builds are configurable
// (CLAP and lyrics indexes are opt-in, the AI provider can be NONE), so the UI
// only offers what the deployment actually answers to.
export interface AudioMuseFeatures {
  clapEnabled: boolean;
  lyricsEnabled: boolean;
  /** The deployment's *default* provider (AI_MODEL_PROVIDER), "NONE" when unset. */
  aiProvider: string | null;
  /**
   * Tracks AudioMuse has analysed, and of those the ones carrying a CLAP
   * embedding. `null` means it wouldn't say (older deployment, no dashboard
   * snapshot yet) — only a real 0 proves nothing was scanned, so every consumer
   * must treat null as "unknown" rather than empty. See audioMuseIndexState.
   */
  analyzedTrackCount: number | null;
  clapIndexedCount: number | null;
  moodLabels: string[];
  availableServers: AudioMuseServer[];
  /** The deployment answered /api/config/defaults, i.e. it has sonic fingerprint. */
  fingerprintEnabled: boolean;
  /**
   * The media server AudioMuse profiles, which decides which credentials the
   * fingerprint needs. Not the app's own `serverType`: one can point at Jellyfin
   * while the other analyses Navidrome.
   */
  fingerprintServerType: string | null;
  /** The account AudioMuse would fall back to, used to pre-fill the form. */
  fingerprintDefaultUser: string | null;
  /**
   * The deployment answered /api/search_artists, i.e. it carries the
   * artist-similarity blueprint. Says nothing about whether the artist index was
   * ever built — see probeFeatures.
   */
  artistSimilarityEnabled: boolean;
  /**
   * The merged lyrics+audio (SemGrove) index is loaded, so a song path can walk
   * lyrical meaning instead of sound. Separate from `lyricsEnabled`, which is
   * the text-search index: a deployment can serve one without the other.
   */
  semGroveEnabled: boolean;
  lastProbeAt: number | null;
}

export const AUDIOMUSE_AI_PROVIDERS = [
  "OLLAMA",
  "OPENAI",
  "GEMINI",
  "MISTRAL",
] as const;

export type AudioMuseAiProvider = (typeof AUDIOMUSE_AI_PROVIDERS)[number];

// Where a generated track list is written when the user saves it: through the
// app's own playlist API, or by asking AudioMuse to create it on the media
// server with its own credentials.
export type AudioMuseSaveTarget = "wavio" | "audiomuse";

interface AudioMuseStore extends AudioMuseFeatures {
  serverUrl: string;
  apiToken: string;
  // Set true after /api/health succeeds; gates every AudioMuse surface.
  isConnected: boolean;
  // Which media server of the AudioMuse deployment to target. null = its
  // default. AudioMuse translates every item_id it returns into the selected
  // server's provider ids, so a wrong pick yields ids this app can't resolve.
  serverId: string | null;
  // Which LLM the prompt-playlist calls ask for. null = whatever the deployment
  // defaults to. AudioMuse only *defaults* `ai_provider` from its own config, so
  // an instance can hold Gemini credentials while AI_MODEL_PROVIDER is still
  // NONE — picking one here is what makes that instance usable.
  aiProviderOverride: AudioMuseAiProvider | null;
  saveTarget: AudioMuseSaveTarget;
  // The sonic fingerprint reads the user's own play history off the media
  // server, which the AudioMuse API token does not grant — so it carries a
  // second, media-server credential. The secret is optional: AudioMuse falls
  // back to the credentials it was set up with.
  fingerprintUser: string;
  fingerprintSecret: string;
  setConfig: (config: { serverUrl: string; apiToken: string }) => void;
  setConnected: (connected: boolean) => void;
  setFeatures: (features: Partial<AudioMuseFeatures>) => void;
  setServerId: (serverId: string | null) => void;
  setAiProviderOverride: (provider: AudioMuseAiProvider | null) => void;
  setSaveTarget: (saveTarget: AudioMuseSaveTarget) => void;
  setFingerprintCredentials: (credentials: {
    user: string;
    secret: string;
  }) => void;
  clearConfig: () => void;
  __reset: () => void;
}

const initialState = {
  serverUrl: "",
  apiToken: "",
  isConnected: false,
  serverId: null,
  aiProviderOverride: null as AudioMuseAiProvider | null,
  saveTarget: "wavio" as AudioMuseSaveTarget,
  clapEnabled: false,
  lyricsEnabled: false,
  aiProvider: null,
  analyzedTrackCount: null,
  clapIndexedCount: null,
  moodLabels: [],
  availableServers: [],
  fingerprintEnabled: false,
  fingerprintServerType: null,
  fingerprintDefaultUser: null,
  fingerprintUser: "",
  fingerprintSecret: "",
  artistSimilarityEnabled: false,
  semGroveEnabled: false,
  lastProbeAt: null,
};

const useAudioMuseBase = create<AudioMuseStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setConfig: ({ serverUrl, apiToken }) => {
        set({ serverUrl, apiToken });
      },
      setConnected: (isConnected) => {
        set({ isConnected });
      },
      setFeatures: (features) => {
        set({ ...features, lastProbeAt: Date.now() });
      },
      setServerId: (serverId) => {
        set({ serverId });
      },
      setAiProviderOverride: (aiProviderOverride) => {
        set({ aiProviderOverride });
      },
      setSaveTarget: (saveTarget) => {
        set({ saveTarget });
      },
      setFingerprintCredentials: ({ user, secret }) => {
        set({ fingerprintUser: user, fingerprintSecret: secret });
      },
      clearConfig: () => {
        set(() => ({ ...initialState }));
      },
    }),
    {
      name: "audioMuseStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        apiToken: state.apiToken,
        isConnected: state.isConnected,
        serverId: state.serverId,
        aiProviderOverride: state.aiProviderOverride,
        saveTarget: state.saveTarget,
        clapEnabled: state.clapEnabled,
        lyricsEnabled: state.lyricsEnabled,
        aiProvider: state.aiProvider,
        analyzedTrackCount: state.analyzedTrackCount,
        clapIndexedCount: state.clapIndexedCount,
        moodLabels: state.moodLabels,
        availableServers: state.availableServers,
        fingerprintEnabled: state.fingerprintEnabled,
        fingerprintServerType: state.fingerprintServerType,
        fingerprintDefaultUser: state.fingerprintDefaultUser,
        fingerprintUser: state.fingerprintUser,
        fingerprintSecret: state.fingerprintSecret,
        artistSimilarityEnabled: state.artistSimilarityEnabled,
        semGroveEnabled: state.semGroveEnabled,
        lastProbeAt: state.lastProbeAt,
      }),
    },
  ),
);

const useAudioMuse = createSelectors(useAudioMuseBase);

function normalizeProvider(provider: string | null | undefined): string | null {
  const value = provider?.trim();
  // "NONE" is how AudioMuse spells "no LLM wired up", not a provider name.
  if (!value || value.toUpperCase() === "NONE") return null;
  return value.toUpperCase();
}

/**
 * The provider a prompt-playlist call will actually run with, or null when there
 * is none. Every AI surface gates on this rather than on `aiProvider`: the
 * deployment default is only a default, and AudioMuse takes `ai_provider` per
 * request, so a user pick outranks it.
 */
export function selectAiProvider(state: {
  aiProvider: string | null;
  aiProviderOverride: AudioMuseAiProvider | null;
}): string | null {
  return (
    normalizeProvider(state.aiProviderOverride) ??
    normalizeProvider(state.aiProvider)
  );
}

/** Non-React read of the same value, for the service layer. */
export function getAiProvider(): string | null {
  return selectAiProvider(useAudioMuseBase.getState());
}

/** Server types whose listening history is read per user rather than server-wide. */
const PER_USER_FINGERPRINT_SERVERS = ["jellyfin", "emby", "navidrome"];

/**
 * Whether the fingerprint needs a media-server account from the user. Lyrion and
 * Plex — and any pre-3.0.0 deployment that wouldn't name its type — take none
 * and profile the account AudioMuse was set up with.
 */
export function needsFingerprintCredentials(
  serverType: string | null,
): boolean {
  return !!serverType && PER_USER_FINGERPRINT_SERVERS.includes(serverType);
}

/**
 * Whether a sonic fingerprint can actually be generated: the deployment has the
 * feature and, when it profiles per user, an account to profile. Emby counts as
 * per-user even though its API tolerates an absent identifier — omitting it
 * silently profiles AudioMuse's own account instead of the signed-in user's.
 */
export function selectFingerprintAvailable(state: {
  isConnected: boolean;
  fingerprintEnabled: boolean;
  fingerprintServerType: string | null;
  fingerprintUser: string;
}): boolean {
  if (!state.isConnected || !state.fingerprintEnabled) return false;
  if (!needsFingerprintCredentials(state.fingerprintServerType)) return true;
  return !!state.fingerprintUser.trim();
}

/**
 * Whether the sound-alike search can be offered. It rides on the core IVF index
 * every deployment serves, so there is no capability to probe — only the
 * analysis it reads from. An explicit 0 analysed tracks means the index is
 * empty and every search would come back empty; a null count is a deployment
 * that wouldn't say, which is not a reason to hide the feature.
 */
export function selectSimilarTracksAvailable(state: {
  isConnected: boolean;
  analyzedTrackCount: number | null;
}): boolean {
  return state.isConnected && state.analyzedTrackCount !== 0;
}

/**
 * Whether the sound-alike *artist* row can be offered. Unlike similar tracks
 * this one does have a blueprint to probe, but the probe only proves the routes
 * exist — an index the operator never built answers 503, which the service turns
 * into an empty row. So this gates the surface, not the guarantee of a result.
 */
export function selectSimilarArtistsAvailable(state: {
  isConnected: boolean;
  artistSimilarityEnabled: boolean;
  analyzedTrackCount: number | null;
}): boolean {
  return (
    state.isConnected &&
    state.artistSimilarityEnabled &&
    state.analyzedTrackCount !== 0
  );
}

/**
 * Whether a song path can be offered. Like similar tracks it rides on the core
 * analysis every deployment serves — the path blueprint is registered
 * unconditionally, so there is no capability to probe, only the index it reads
 * from. An explicit 0 analysed tracks means no path could ever be walked.
 */
export function selectSongPathAvailable(state: {
  isConnected: boolean;
  analyzedTrackCount: number | null;
}): boolean {
  return state.isConnected && state.analyzedTrackCount !== 0;
}

/**
 * Whether a song path can follow lyrical meaning rather than sound. The merged
 * index is a separate, opt-in build step, and the endpoint refuses outright
 * without it — so this hides the option rather than letting the path fail.
 */
export function selectLyricsPathAvailable(state: {
  isConnected: boolean;
  analyzedTrackCount: number | null;
  semGroveEnabled: boolean;
}): boolean {
  return selectSongPathAvailable(state) && state.semGroveEnabled;
}

/** Which index a result set was drawn from, so an empty one can be explained. */
export type AudioMuseIndexScope = "analysis" | "clap" | "lyrics";

/** A reason a result set is empty that has nothing to do with the query. */
export type AudioMuseEmptyReason = "notAnalyzed" | "clapNotIndexed";

/**
 * Explains an empty AudioMuse result set from what the deployment reports about
 * its own indexes, or null when the query really is the reason. Only an explicit
 * 0 counts: a null count means the deployment didn't say, and blaming the scan
 * then would be a guess.
 *
 * Lyrics has no equivalent server-side count, so a lyrics search can only be
 * explained by the catalogue being empty.
 */
export function selectEmptyReason(
  state: Pick<AudioMuseFeatures, "analyzedTrackCount" | "clapIndexedCount">,
  scope: AudioMuseIndexScope,
): AudioMuseEmptyReason | null {
  if (state.analyzedTrackCount === 0) return "notAnalyzed";
  if (scope === "clap" && state.clapIndexedCount === 0) return "clapNotIndexed";
  return null;
}

export default useAudioMuse;
export { useAudioMuseBase };
