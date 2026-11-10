const SECRETS = {
  username: "jdoe-private",
  url: "https://tunes.jdoe-home.example:8443/nd",
  fallbackUrl: "http://192.168.1.42:4533",
  serverName: "Basement Rack",
  serverId: "srv-6f1c2a",
  headerName: "CF-Access-Client-Id",
  headerValue: "cf-token-abc123",
  mtlsAlias: "jdoe-client-cert",
  lastFmUser: "jdoe_fm",
  deviceName: "Jane's Pixel",
  downloadFolder: "content://tree/primary%3AMusic%2FJane",
  lidarrUrl: "http://lidarr.jdoe-home.example",
};

const store = <T>(state: T) => {
  const hook = () => state;
  hook.getState = () => state;
  return hook;
};

jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.4.0",
  nativeBuildVersion: "140",
  applicationId: "com.jmercier.wavio",
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { sdkVersion: "58.0.0" } },
}));
jest.mock("expo-device", () => ({
  osName: "Android",
  osVersion: "15",
  platformApiLevel: 35,
  manufacturer: "Google",
  brand: "google",
  modelName: "Pixel 8",
  isDevice: true,
  supportedCpuArchitectures: ["arm64-v8a"],
  totalMemory: 8 * 1024 ** 3,
  deviceName: "Jane's Pixel",
}));
jest.mock("expo-file-system", () => ({
  Paths: {
    availableDiskSpace: 20 * 1024 ** 3,
    totalDiskSpace: 128 * 1024 ** 3,
  },
}));
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "fr", regionCode: "FR" }],
}));
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
}));
jest.mock("@/services/network", () => ({
  getConnectionType: () => "wifi",
  getIsOnline: () => true,
  getServerReachable: () => true,
}));
jest.mock("@/services/playback/remoteTarget", () => ({
  activeRemoteTarget: () => null,
}));
jest.mock("@/stores/app", () => ({
  useAppBase: store({
    streamingFormat: "raw",
    downloadLocationUri: "content://tree/primary%3AMusic%2FJane",
    albumArtNames: ["jane-cover"],
    setStreamingFormat: () => {},
  }),
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => "scope",
  useAuthBase: store({
    isAuthenticated: true,
    serverId: "srv-6f1c2a",
    url: "https://tunes.jdoe-home.example:8443/nd",
    username: "jdoe-private",
    password: "hunter2-password",
    serverType: "navidrome",
    authMethod: "password",
    serverVersion: "0.58.0 (fc1b2a)",
    useTokenAuth: true,
    isAdmin: false,
    hasNavidromeNative: true,
    userId: "user-9a8b7c",
    jellyfinUserId: null,
  }),
}));
jest.mock("@/stores/servers", () => ({
  serverTypeSchema: {
    options: [
      "navidrome",
      "opensubsonic",
      "jellyfin",
      "local",
      "webdav",
      "smb",
    ],
  },
  useServersBase: store({
    servers: [
      {
        id: "srv-6f1c2a",
        name: "Basement Rack",
        url: "https://tunes.jdoe-home.example:8443/nd",
        fallbackUrl: "http://192.168.1.42:4533",
        type: "navidrome",
        mtlsAlias: "jdoe-client-cert",
        headers: { "CF-Access-Client-Id": "cf-token-abc123" },
      },
    ],
    users: [
      { serverId: "srv-6f1c2a", username: "jdoe-private" },
      { serverId: "srv-6f1c2a", username: "wavio" },
    ],
  }),
}));
jest.mock("@/stores/serverExtensions", () => ({
  useServerExtensionsBase: store({
    extensions: [{ name: "songLyrics", versions: [1] }],
  }),
}));
jest.mock("@/stores/musicFolders", () => ({
  useMusicFoldersBase: store({ selections: { scope: ["lib-1", "lib-2"] } }),
}));
jest.mock("@/stores/capabilityOverrides", () => ({
  __esModule: true,
  default: store({ disabledAt: {} }),
  activeOverrides: () => ({ sharing: false }),
}));
jest.mock("@/stores/cast", () => ({
  useCastBase: store({ available: false }),
}));
jest.mock("@/stores/upnp", () => ({
  useUpnpBase: store({ connected: false }),
}));
jest.mock("@/stores/jukebox", () => ({
  __esModule: true,
  default: store({ active: false }),
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: store({
    offlineModeEnabled: true,
    autoDownloadLikedAlbums: false,
    autoDownloadPlaylists: false,
    autoDownloadOverrides: {},
    downloadedTracks: { a: {}, b: {} },
    downloadedCollections: {},
    downloadQueue: [],
    downloadProgress: { a: { error: "HTTP 500 from 192.168.1.42" } },
  }),
}));
jest.mock("@/stores/librarySync", () => ({
  useLibrarySyncBase: store({
    extendedOfflineModeEnabled: false,
    phase: "idle",
    lastError: null,
    lastSyncCompletedAt: null,
  }),
}));
jest.mock("@/stores/localLibrary", () => ({
  __esModule: true,
  default: store({ status: { phase: "idle" } }),
}));
jest.mock("@/stores/lastFm", () => ({
  __esModule: true,
  default: store({
    sessionKey: "lastfm-session-key",
    userName: "jdoe_fm",
    sessionInvalid: false,
    scrobblingEnabled: true,
    submitNowPlaying: true,
    syncLoves: false,
    serverIsScrobbling: "no",
    queue: [],
  }),
}));
jest.mock("@/stores/listenBrainz", () => ({
  __esModule: true,
  LISTENBRAINZ_DEFAULT_BASE_URL: "https://api.listenbrainz.org",
  default: store({
    token: "",
    userName: null,
    baseUrl: "https://api.listenbrainz.org",
    scrobblingEnabled: false,
    submitNowPlaying: false,
    serverIsScrobbling: "unknown",
    queue: [],
  }),
}));
jest.mock("@/stores/audioMuse", () => ({
  __esModule: true,
  default: store({ isConnected: false, serverVersion: null, serverUrl: "" }),
}));
jest.mock("@/stores/audiobookshelf", () => ({
  __esModule: true,
  default: store({
    isConnected: false,
    serverVersion: null,
    serverUrl: "",
    username: "",
  }),
}));
jest.mock("@/stores/lidarr", () => ({
  __esModule: true,
  default: store({
    isConnected: true,
    serverUrl: "http://lidarr.jdoe-home.example",
  }),
}));
jest.mock("@/stores/soulsync", () => ({
  __esModule: true,
  default: store({ isConnected: false, serverUrl: "" }),
}));
jest.mock("@/stores/tidarr", () => ({
  __esModule: true,
  default: store({ isConnected: false, serverUrl: "", quality: null }),
}));
jest.mock("@/stores/musicbrainz", () => ({
  __esModule: true,
  default: store({
    tagWriteMode: "safe",
    autoApplyEnabled: false,
    autoApplyThreshold: 95,
  }),
}));
jest.mock("@/stores/podcasts", () => ({
  usePodcastsBase: store({
    taddyPodcastsApiKey: "taddy-key",
    taddyPodcastsLanguage: "ENGLISH",
  }),
}));

import { buildBugReport } from "@/services/bugReport";

describe("buildBugReport", () => {
  const report = buildBugReport();

  it.each(Object.entries(SECRETS))("never contains the %s", (_, secret) => {
    expect(report.toLowerCase()).not.toContain(secret.toLowerCase());
  });

  it("never contains credentials", () => {
    for (const credential of [
      "hunter2-password",
      "lastfm-session-key",
      "taddy-key",
      "user-9a8b7c",
      "jdoe-home",
    ]) {
      expect(report).not.toContain(credential);
    }
  });

  it("doesn't mask the app's own name when an account shares it", () => {
    expect(report).toContain("<summary>Wavio diagnostics</summary>");
    expect(report).toContain("application id: com.jmercier.wavio");
  });

  it("only shows rows that apply to the server type", () => {
    expect(report).toContain("navidrome native api: true");
    expect(report).toContain("subsonic token auth: true");
    expect(report).not.toContain("musicbrainz");
  });

  it("carries the debugging info", () => {
    expect(report).toContain("version: 1.4.0");
    expect(report).toContain("type: navidrome");
    expect(report).toContain("version: 0.58.0 (fc1b2a)");
    expect(report).toContain("model: Pixel 8");
    expect(report).toContain("host kind: domain name");
    expect(report).toContain("custom headers: 1");
    expect(report).toContain("client certificate (mTLS): set");
    expect(report).toContain("libraries selected: 2");
    expect(report).toContain("turned off at runtime: sharing");
    expect(report).toContain("last.fm connected: true");
    expect(report).toContain("lidarr connected: true");
    expect(report).toContain("streamingFormat: raw");
    expect(report).toContain("downloadLocationUri: set");
    expect(report).toContain("failed downloads: 1");
  });
});
