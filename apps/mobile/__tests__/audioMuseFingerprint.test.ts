// The sonic fingerprint is the one AudioMuse surface that needs a *second* set
// of credentials — an account on the media server, because the API token grants
// no play history. Getting the wrong field pair on the wire is a 400 the user
// can't diagnose, and omitting the identifier on Emby silently profiles
// AudioMuse's own account instead of theirs.
const mockRequest = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
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
  clampFingerprintResults,
  FINGERPRINT_MAX_RESULTS,
  FINGERPRINT_MIN_RESULTS,
  generateSonicFingerprint,
  resolveFingerprintDefaultUser,
  resolveFingerprintServerType,
} from "@/services/audioMuse/fingerprint";
import { probeFeatures } from "@/services/audioMuse/system";
import {
  selectFingerprintAvailable,
  useAudioMuseBase,
} from "@/stores/audioMuse";

const lastRequest = () => mockRequest.mock.calls.at(-1)?.[0];

const connected = (features: Record<string, unknown> = {}) => {
  const store = useAudioMuseBase.getState();
  store.setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
  store.setConnected(true);
  store.setFeatures({ fingerprintEnabled: true, ...features });
};

beforeEach(() => {
  mockRequest.mockReset();
  mockRequest.mockResolvedValue({ data: [] });
  useAudioMuseBase.getState().__reset();
});

describe("resolveFingerprintServerType", () => {
  it("uses the type the deployment declares", () => {
    expect(resolveFingerprintServerType({ server_type: "Navidrome" })).toBe(
      "navidrome",
    );
  });

  // server_type only exists from AudioMuse 3.0.0; before that the account key is
  // the only signal, and rendering the wrong credential pair sends fields the
  // endpoint ignores, so the call 400s on a missing identifier instead.
  it("infers the type from the account key on older deployments", () => {
    expect(resolveFingerprintServerType({ default_user_id: "u-1" })).toBe(
      "jellyfin",
    );
    expect(resolveFingerprintServerType({ default_user: "joel" })).toBe(
      "navidrome",
    );
  });

  it("reports no type when the deployment names neither", () => {
    expect(resolveFingerprintServerType({})).toBeNull();
    expect(resolveFingerprintServerType(null)).toBeNull();
  });

  it("reads the default account from whichever key carries it", () => {
    expect(resolveFingerprintDefaultUser({ default_user_id: "u-1" })).toBe(
      "u-1",
    );
    expect(resolveFingerprintDefaultUser({ default_user: "joel" })).toBe(
      "joel",
    );
    expect(resolveFingerprintDefaultUser({})).toBeNull();
  });
});

describe("probeFeatures", () => {
  const config = { serverUrl: "http://muse.local", apiToken: "T" };

  // /api/config/defaults is served by the sonic-fingerprint blueprint itself, so
  // answering at all is the capability check — there is no feature flag to read.
  it("treats a 404 on the defaults endpoint as no fingerprint feature", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) => {
      if (url === "/api/config/defaults") throw new Error("404");
      return { data: {} };
    });

    await expect(probeFeatures(config)).resolves.toMatchObject({
      fingerprintEnabled: false,
      fingerprintServerType: null,
      fingerprintDefaultUser: null,
    });
  });

  it("keeps the feature available when the deployment won't name its type", async () => {
    mockRequest.mockImplementation(async ({ url }: { url: string }) =>
      url === "/api/config/defaults" ? { data: {} } : { data: {} },
    );

    await expect(probeFeatures(config)).resolves.toMatchObject({
      fingerprintEnabled: true,
      fingerprintServerType: null,
    });
  });
});

describe("generateSonicFingerprint", () => {
  it("sends the Jellyfin field pair", async () => {
    connected({ fingerprintServerType: "jellyfin" });
    useAudioMuseBase
      .getState()
      .setFingerprintCredentials({ user: "joel", secret: "tok" });

    await generateSonicFingerprint({ numResults: 200 });

    expect(lastRequest()).toMatchObject({
      url: "/api/sonic_fingerprint/generate",
      method: "post",
      data: {
        n: 200,
        jellyfin_user_identifier: "joel",
        jellyfin_token: "tok",
      },
    });
  });

  // Emby shares Jellyfin's request fields, so it must not fall through to the
  // credential-less branch — the endpoint tolerates a missing identifier there
  // and quietly profiles the account AudioMuse was set up with.
  it("sends the Jellyfin field pair for Emby too", async () => {
    connected({ fingerprintServerType: "emby" });
    useAudioMuseBase
      .getState()
      .setFingerprintCredentials({ user: "joel", secret: "" });

    await generateSonicFingerprint({ numResults: 60 });

    expect(lastRequest().data).toMatchObject({
      jellyfin_user_identifier: "joel",
    });
    expect(lastRequest().data).not.toHaveProperty("navidrome_user");
  });

  it("sends the Navidrome field pair", async () => {
    connected({ fingerprintServerType: "navidrome" });
    useAudioMuseBase
      .getState()
      .setFingerprintCredentials({ user: "joel", secret: "pw" });

    await generateSonicFingerprint({ numResults: 100 });

    expect(lastRequest().data).toMatchObject({
      navidrome_user: "joel",
      navidrome_password: "pw",
    });
    expect(lastRequest().data).not.toHaveProperty("jellyfin_token");
  });

  // A blank secret must be absent rather than empty: AudioMuse only falls back
  // to its own stored credentials when the field isn't there at all.
  it("omits an empty secret instead of sending a blank one", async () => {
    connected({ fingerprintServerType: "navidrome" });
    useAudioMuseBase
      .getState()
      .setFingerprintCredentials({ user: "joel", secret: "  " });

    await generateSonicFingerprint({ numResults: 100 });

    expect(lastRequest().data).not.toHaveProperty("navidrome_password");
  });

  it("sends no credentials for a server type that takes none", async () => {
    connected({ fingerprintServerType: "lyrion" });

    await generateSonicFingerprint({ numResults: 100 });

    expect(lastRequest().data).toEqual({ n: 100 });
  });

  // The endpoint clamps nothing: below the seed count it returns only songs the
  // user already plays, and a huge n makes it walk the whole index.
  it("clamps the requested count to the usable range", async () => {
    expect(clampFingerprintResults(1)).toBe(FINGERPRINT_MIN_RESULTS);
    expect(clampFingerprintResults(-10)).toBe(FINGERPRINT_MIN_RESULTS);
    expect(clampFingerprintResults(99999)).toBe(FINGERPRINT_MAX_RESULTS);
    expect(clampFingerprintResults(Number.NaN)).toBe(200);
    expect(clampFingerprintResults(120.6)).toBe(121);

    connected({ fingerprintServerType: "lyrion" });
    await generateSonicFingerprint({ numResults: 5 });

    expect(lastRequest().data.n).toBe(FINGERPRINT_MIN_RESULTS);
  });

  // Unlike the search endpoints this one answers with a bare array, not a
  // `{ results }` envelope.
  it("reads the bare array the endpoint returns", async () => {
    connected({ fingerprintServerType: "lyrion" });
    mockRequest.mockResolvedValue({
      data: [{ item_id: "a" }, { item_id: "b" }],
    });

    await expect(
      generateSonicFingerprint({ numResults: 100 }),
    ).resolves.toEqual([{ item_id: "a" }, { item_id: "b" }]);
  });

  it("treats a non-array body as no results", async () => {
    connected({ fingerprintServerType: "lyrion" });
    mockRequest.mockResolvedValue({ data: { error: "nope" } });

    await expect(
      generateSonicFingerprint({ numResults: 100 }),
    ).resolves.toEqual([]);
  });
});

describe("selectFingerprintAvailable", () => {
  const state = (overrides: Record<string, unknown> = {}) => ({
    isConnected: true,
    fingerprintEnabled: true,
    fingerprintServerType: "jellyfin" as string | null,
    fingerprintUser: "joel",
    ...overrides,
  });

  it("needs both a connection and the feature", () => {
    expect(selectFingerprintAvailable(state())).toBe(true);
    expect(selectFingerprintAvailable(state({ isConnected: false }))).toBe(
      false,
    );
    expect(
      selectFingerprintAvailable(state({ fingerprintEnabled: false })),
    ).toBe(false);
  });

  it("needs an account on the servers that profile per user", () => {
    expect(selectFingerprintAvailable(state({ fingerprintUser: " " }))).toBe(
      false,
    );
    expect(
      selectFingerprintAvailable(
        state({ fingerprintServerType: "emby", fingerprintUser: "" }),
      ),
    ).toBe(false);
  });

  it("needs none on the servers that don't", () => {
    expect(
      selectFingerprintAvailable(
        state({ fingerprintServerType: "lyrion", fingerprintUser: "" }),
      ),
    ).toBe(true);
    expect(
      selectFingerprintAvailable(
        state({ fingerprintServerType: null, fingerprintUser: "" }),
      ),
    ).toBe(true);
  });
});
