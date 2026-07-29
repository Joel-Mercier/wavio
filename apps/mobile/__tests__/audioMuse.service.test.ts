// The request wrapper carries three decisions that are invisible at the call
// sites and wrong in ways that don't error: an empty token must not become a
// `Bearer ` header (a deployment with auth on rejects it), and the media-server
// selection must ride on every scoped call — without it AudioMuse answers with
// another library's ids, which resolve to nothing.
const mockRequest = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      // Forwarded through a closure: the service calls axios.create() at import
      // time, before `const mockRequest` above is initialised.
      create: () => ({
        request: (...args: unknown[]) => mockRequest(...args),
      }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));

jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  AudioMuseNotConfiguredError,
  audioMuseRequest,
} from "@/services/audioMuse";
import {
  AudioMuseUnauthorizedError,
  AudioMuseUnreachableError,
  connect,
  probeFeatures,
} from "@/services/audioMuse/system";
import { useAudioMuseBase } from "@/stores/audioMuse";

const lastRequest = () => mockRequest.mock.calls.at(-1)?.[0];

const unauthorized = () =>
  Object.assign(new Error("HTTP 401"), {
    isAxiosError: true,
    response: { status: 401 },
  });

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ data: {} });
  useAudioMuseBase.getState().__reset();
});

describe("audioMuseRequest", () => {
  it("refuses to call without a configured server", async () => {
    await expect(audioMuseRequest("/api/health")).rejects.toBeInstanceOf(
      AudioMuseNotConfiguredError,
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("trims trailing slashes off the base URL", async () => {
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local:8000//", apiToken: "T" });

    await audioMuseRequest("/api/health");

    expect(lastRequest()).toMatchObject({
      baseURL: "http://muse.local:8000",
      url: "/api/health",
    });
  });

  it("sends the token as a bearer header", async () => {
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });

    await audioMuseRequest("/api/health");

    expect(lastRequest().headers).toMatchObject({ Authorization: "Bearer T" });
  });

  it("omits the authorization header when no token is set", async () => {
    // A deployment with AUTH_ENABLED=false issues no token; `Bearer ` would be
    // sent as a malformed credential to one that has auth on.
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local", apiToken: "" });

    await audioMuseRequest("/api/health");

    expect(lastRequest().headers).not.toHaveProperty("Authorization");
  });

  it("prefers an explicit config over the stored one", async () => {
    // The Test/Connect flow validates before saving.
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://saved", apiToken: "SAVED" });

    await audioMuseRequest("/api/health", {
      config: { serverUrl: "http://typed", apiToken: "TYPED" },
    });

    expect(lastRequest()).toMatchObject({ baseURL: "http://typed" });
    expect(lastRequest().headers).toMatchObject({
      Authorization: "Bearer TYPED",
    });
  });

  it("adds the server selection as a query param on GETs", async () => {
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
    useAudioMuseBase.getState().setServerId("srv-2");

    await audioMuseRequest("/api/similar_tracks", { params: { item_id: "a" } });

    expect(lastRequest().params).toEqual({ item_id: "a", server: "srv-2" });
  });

  it("adds the server selection to the body on POSTs", async () => {
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
    useAudioMuseBase.getState().setServerId("srv-2");

    await audioMuseRequest("/api/clap/search", {
      method: "post",
      data: { query: "calm piano" },
    });

    expect(lastRequest().data).toEqual({
      query: "calm piano",
      server: "srv-2",
    });
  });

  it("leaves deployment-wide endpoints unscoped", async () => {
    // /api/servers is what discovers the selectable servers in the first place.
    useAudioMuseBase
      .getState()
      .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
    useAudioMuseBase.getState().setServerId("srv-2");

    await audioMuseRequest("/api/servers", { skipServerScope: true });

    expect(lastRequest().params).toBeUndefined();
  });
});

describe("connect", () => {
  const config = { serverUrl: "http://muse.local", apiToken: "T" };

  it("accepts a healthy, authenticated instance", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) =>
      url === "/api/health" ? { data: { status: "ok" } } : { data: {} },
    );

    await expect(connect(config)).resolves.toMatchObject({
      clapEnabled: false,
    });
  });

  it("rejects a body that isn't the health payload", async () => {
    // An instance still on its first-run wizard answers 200 with an HTML
    // redirect page, which would otherwise read as a successful connection.
    mockRequest.mockResolvedValue({ data: "<!doctype html>" });
    await expect(connect(config)).rejects.toBeInstanceOf(
      AudioMuseUnreachableError,
    );
  });

  it("rejects a bad token even though /api/health accepts it", async () => {
    // AudioMuse exempts /api/health from its auth barrier, so it answers "ok"
    // to an empty or wrong token. Without the gated probes deciding, a bad
    // token would connect successfully with every feature silently off.
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/health") return { data: { status: "ok" } };
      throw unauthorized();
    });

    await expect(connect(config)).rejects.toBeInstanceOf(
      AudioMuseUnauthorizedError,
    );
  });
});

describe("probeFeatures", () => {
  const config = { serverUrl: "http://muse.local", apiToken: "T" };

  it("reports what the deployment supports", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/config")
        return {
          data: { ai_model_provider: "GEMINI", mood_labels: ["happy"] },
        };
      if (url === "/api/clap/stats") return { data: { clap_enabled: true } };
      if (url === "/api/lyrics/stats")
        return { data: { lyrics_enabled: false } };
      if (url === "/api/servers")
        return {
          data: {
            servers: [
              { server_id: "s1", name: "Navidrome", is_default: true },
              { server_id: "s2", name: "Jellyfin" },
            ],
          },
        };
      if (url === "/api/dashboard/summary")
        return { data: { content: { total_songs: 1200, clap_indexed: 900 } } };
      if (url === "/api/config/defaults")
        return { data: { server_type: "jellyfin", default_user_id: "u-1" } };
      if (url === "/api/sem_grove/stats")
        return { data: { loaded: true, song_count: 800 } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toEqual({
      clapEnabled: true,
      lyricsEnabled: false,
      aiProvider: "GEMINI",
      analyzedTrackCount: 1200,
      clapIndexedCount: 900,
      moodLabels: ["happy"],
      availableServers: [
        { id: "s1", name: "Navidrome", isDefault: true },
        { id: "s2", name: "Jellyfin", isDefault: false },
      ],
      fingerprintEnabled: true,
      fingerprintServerType: "jellyfin",
      fingerprintDefaultUser: "u-1",
      artistSimilarityEnabled: true,
      semGroveEnabled: true,
    });
  });

  // The lyrics path space walks the *merged* lyrics+audio index, which is a
  // separate build step from the text-search one — so a deployment can answer
  // /api/lyrics/stats while this one was never built, and reading the wrong
  // endpoint would offer an option the path endpoint refuses outright.
  it("reads the merged lyrics index separately from the text one", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/lyrics/stats")
        return { data: { lyrics_enabled: true } };
      if (url === "/api/sem_grove/stats") return { data: { loaded: false } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      lyricsEnabled: true,
      semGroveEnabled: false,
    });
  });

  // /api/search_artists is the probe because it needs no seed artist and reads
  // the analysed-track table, so it answers whatever state the artist index is
  // in — which also means it can only prove the routes exist.
  it("reads a 404 on /api/search_artists as no artist similarity", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/search_artists") throw new Error("404");
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      artistSimilarityEnabled: false,
    });
  });

  it("treats an empty artist search as the feature being present", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/search_artists") return { data: [] };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      artistSimilarityEnabled: true,
    });
  });

  // The difference decides whether the app may blame an unscanned library for an
  // empty result set: a real 0 is a verdict, a missing key is silence.
  it("keeps an unreported analysis count as unknown, not zero", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      // An older deployment 404s the dashboard blueprint; a fresh one answers
      // with no snapshot yet, and a failed count query publishes an explicit null.
      if (url === "/api/dashboard/summary")
        return { data: { content: { total_songs: null } } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      analyzedTrackCount: null,
      clapIndexedCount: null,
    });
  });

  it("reports a genuinely empty catalogue as zero", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/dashboard/summary")
        return { data: { content: { total_songs: 0, clap_indexed: 0 } } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      analyzedTrackCount: 0,
      clapIndexedCount: 0,
    });
  });

  it("prefers the chat blueprint's own provider over /api/config", async () => {
    // /chat/api/config_defaults is what the prompt-playlist endpoints read.
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/chat/api/config_defaults")
        return { data: { default_ai_provider: "OLLAMA" } };
      if (url === "/api/config") return { data: { ai_model_provider: "NONE" } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      aiProvider: "OLLAMA",
    });
  });

  it("falls back to /api/config when the chat blueprint isn't mounted", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/chat/api/config_defaults") throw new Error("404");
      if (url === "/api/config")
        return { data: { ai_model_provider: "GEMINI" } };
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      aiProvider: "GEMINI",
    });
  });

  it("degrades a failing probe to an unavailable feature", async () => {
    // Older deployments 404 on some of these; that must not fail the connect.
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/clap/stats") throw new Error("404");
      return { data: {} };
    });

    const features = await probeFeatures(config);

    expect(features.clapEnabled).toBe(false);
    expect(features.aiProvider).toBeNull();
    expect(features.availableServers).toEqual([]);
  });

  it("raises a rejected token instead of reporting no features", async () => {
    // Every gated probe 401s at once, which is indistinguishable from a server
    // with nothing enabled unless the auth failure is singled out.
    mockRequest.mockRejectedValue(unauthorized());

    await expect(probeFeatures(config)).rejects.toBeInstanceOf(
      AudioMuseUnauthorizedError,
    );
  });

  it("accepts mood labels sent as a comma-separated string", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) =>
      url === "/api/config"
        ? { data: { mood_labels: "happy, sad ,party" } }
        : { data: {} },
    );

    await expect(probeFeatures(config)).resolves.toMatchObject({
      moodLabels: ["happy", "sad", "party"],
    });
  });
});
