import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Paths } from "expo-file-system";
import { getLocales } from "expo-localization";
import { Appearance, Platform } from "react-native";
import { DISTRIBUTION } from "@/config/distribution";
import i18n from "@/config/i18n";
import {
  getCapabilities,
  sessionCapabilityOverrides,
} from "@/services/backend/capabilities";
import {
  filesAreOnDeviceType,
  usesSubsonicAuthType,
} from "@/services/backend/serverTraits";
import {
  describeAppSettings,
  describeServerAddress,
  formatReport,
  presence,
  type ReportRow,
  type ReportSection,
  scrubReport,
} from "@/services/bugReport/format";
import {
  getConnectionType,
  getIsOnline,
  getServerReachable,
} from "@/services/network";
import { activeRemoteTarget } from "@/services/playback/remoteTarget";
import { useAppBase } from "@/stores/app";
import useAudiobookshelf from "@/stores/audiobookshelf";
import useAudioMuse from "@/stores/audioMuse";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import useCapabilityOverrides, {
  activeOverrides,
} from "@/stores/capabilityOverrides";
import { useCastBase } from "@/stores/cast";
import useJukebox from "@/stores/jukebox";
import useLastFm from "@/stores/lastFm";
import { useLibrarySyncBase } from "@/stores/librarySync";
import useLidarr from "@/stores/lidarr";
import useListenBrainz, {
  LISTENBRAINZ_DEFAULT_BASE_URL,
} from "@/stores/listenBrainz";
import useLocalLibrary from "@/stores/localLibrary";
import useMusicBrainz from "@/stores/musicbrainz";
import { useMusicFoldersBase } from "@/stores/musicFolders";
import useOffline from "@/stores/offline";
import { usePodcastsBase } from "@/stores/podcasts";
import { useServerExtensionsBase } from "@/stores/serverExtensions";
import { serverTypeSchema, useServersBase } from "@/stores/servers";
import useSoulSync from "@/stores/soulsync";
import useTidarr from "@/stores/tidarr";
import { useUpnpBase } from "@/stores/upnp";

export const NEW_ISSUE_URL =
  "https://github.com/Joel-Mercier/wavio/issues/new/choose";

const hostOf = (url: string | null | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
};

const gigabytes = (bytes: number | null | undefined) =>
  bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : undefined;

const tally = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([value, n]) => `${value}×${n}`).join(", ") || "none";
};

const ageOf = (timestamp: number | string | null | undefined) => {
  if (!timestamp) return "never";
  const ms = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const hours = ms / 3_600_000;
  return hours < 48
    ? `${Math.round(hours)} h ago`
    : `${Math.round(hours / 24)} d ago`;
};

const safely = (title: string, read: () => ReportSection): ReportSection => {
  try {
    return read();
  } catch (error) {
    return {
      title,
      rows: [["unavailable", error instanceof Error ? error.name : "error"]],
    };
  }
};

// Strings too common to identify anyone, which the scrub would otherwise mask
// wherever they appear as a closed-set value ("type: navidrome", the app's own
// package name).
const GENERIC_STRINGS = new Set([
  ...serverTypeSchema.options,
  ...(Application.applicationId ?? "").toLowerCase().split("."),
  "wavio",
  "admin",
  "administrator",
  "user",
  "root",
  "guest",
  "test",
  "demo",
  "music",
  "home",
  "server",
  "default",
]);

function appSection(): ReportSection {
  const rnVersion = Platform.constants.reactNativeVersion;
  return {
    title: "App",
    rows: [
      ["version", Application.nativeApplicationVersion],
      ["build", Application.nativeBuildVersion],
      ["application id", Application.applicationId],
      ["distribution", DISTRIBUTION],
      ["environment", process.env.EXPO_PUBLIC_ENV],
      ["expo sdk", Constants.expoConfig?.sdkVersion],
      [
        "react native",
        rnVersion
          ? `${rnVersion.major}.${rnVersion.minor}.${rnVersion.patch}`
          : undefined,
      ],
      ["ui language", i18n.language],
      ["generated", new Date().toISOString().slice(0, 16).replace("T", " ")],
    ],
  };
}

function deviceSection(): ReportSection {
  const deviceLanguage = getLocales()[0]?.languageCode;
  return {
    title: "Device",
    rows: [
      ["os", `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`],
      ["api level", Device.platformApiLevel],
      ["manufacturer", Device.manufacturer],
      ["model", Device.modelName],
      ["physical device", Device.isDevice],
      ["cpu abis", Device.supportedCpuArchitectures?.join(", ")],
      ["memory", gigabytes(Device.totalMemory)],
      ["free storage", gigabytes(Paths.availableDiskSpace)],
      ["total storage", gigabytes(Paths.totalDiskSpace)],
      ["system language", deviceLanguage],
      ["color scheme", Appearance.getColorScheme()],
    ],
  };
}

function serverSection(): ReportSection {
  const auth = useAuthBase.getState();
  const { servers, users } = useServersBase.getState();
  const server = servers.find((s) => s.id === auth.serverId);
  const onFallback =
    !!server?.fallbackUrl && auth.url.trim() === server.fallbackUrl.trim();
  const remote = !filesAreOnDeviceType(auth.serverType);
  const subsonic = usesSubsonicAuthType(auth.serverType);
  const extensions = useServerExtensionsBase
    .getState()
    .extensions.map((ext) => `${ext.name} v${ext.versions.join("/")}`);
  const selection =
    useMusicFoldersBase.getState().selections[currentAuthScope()];

  return {
    title: "Server",
    rows: [
      ["signed in", auth.isAuthenticated],
      ["type", auth.serverType],
      ["version", auth.serverVersion],
      ["auth method", auth.authMethod],
      ["admin", auth.isAdmin],
      ...(subsonic
        ? ([
            ["subsonic token auth", auth.useTokenAuth],
            ["forced password auth", !!server?.plainPasswordAuth],
            ["sso issuer override", presence(server?.oidc?.issuer)],
          ] as ReportRow[])
        : []),
      ...(auth.serverType === "navidrome"
        ? ([["navidrome native api", auth.hasNavidromeNative]] as ReportRow[])
        : []),
      ...(remote ? describeServerAddress(auth.url) : []),
      ["active route", onFallback ? "fallback" : "primary"],
      ["fallback url", presence(server?.fallbackUrl)],
      ["client certificate (mTLS)", presence(server?.mtlsAlias)],
      ["custom headers", Object.keys(server?.headers ?? {}).length],
      ["libraries selected", selection?.length ?? "all"],
      ["server extensions", extensions.join(", ") || "none"],
      ["saved servers", tally(servers.map((s) => s.type))],
      ["saved accounts", users.length],
    ],
  };
}

function capabilitiesSection(): ReportSection {
  const { serverType, authMethod } = useAuthBase.getState();
  const overrides = activeOverrides(
    useCapabilityOverrides.getState().disabledAt,
  );
  const capabilities = {
    ...getCapabilities(serverType),
    ...sessionCapabilityOverrides(authMethod),
    ...overrides,
  };
  const entries = Object.entries(capabilities);
  return {
    title: "Capabilities",
    rows: [
      [
        "off",
        entries
          .filter(([, on]) => !on)
          .map(([key]) => key)
          .join(", ") || "none",
      ],
      ["turned off at runtime", Object.keys(overrides).join(", ") || "none"],
    ],
  };
}

function networkSection(): ReportSection {
  return {
    title: "Network",
    rows: [
      ["connection", getConnectionType()],
      ["device online", getIsOnline()],
      ["server reachable", getServerReachable()],
      ["remote output", activeRemoteTarget()?.id ?? "none"],
      ["cast available", useCastBase.getState().available],
      ["upnp connected", useUpnpBase.getState().connected],
      ["jukebox active", useJukebox.getState().active],
    ],
  };
}

function settingsSection(): ReportSection {
  return {
    title: "Settings",
    rows: describeAppSettings(useAppBase.getState()),
  };
}

function offlineSection(): ReportSection {
  const offline = useOffline.getState();
  const sync = useLibrarySyncBase.getState();
  const failed = Object.values(offline.downloadProgress).filter(
    (progress) => progress.error,
  ).length;
  return {
    title: "Downloads & offline",
    rows: [
      ["auto download liked songs", offline.offlineModeEnabled],
      ["auto download liked albums", offline.autoDownloadLikedAlbums],
      ["auto download playlists", offline.autoDownloadPlaylists],
      [
        "auto download overrides",
        Object.keys(offline.autoDownloadOverrides).length,
      ],
      ["downloaded tracks", Object.keys(offline.downloadedTracks).length],
      [
        "downloaded collections",
        Object.keys(offline.downloadedCollections).length,
      ],
      ["download queue", offline.downloadQueue.length],
      ["failed downloads", failed],
      ["extended offline library sync", sync.extendedOfflineModeEnabled],
      ["library sync phase", sync.phase],
      ["library sync last error", sync.lastError],
      ["library sync last completed", ageOf(sync.lastSyncCompletedAt)],
    ],
  };
}

function localLibrarySection(): ReportSection {
  const { serverType, serverId } = useAuthBase.getState();
  if (!filesAreOnDeviceType(serverType)) return { title: "", rows: [] };
  const server = useServersBase
    .getState()
    .servers.find((s) => s.id === serverId);
  const library = useLocalLibrary.getState();
  const result = library.lastScanResult;
  return {
    title: "Indexed library",
    rows: [
      ["source folders", server?.paths?.length ?? 0],
      ["share sub-path", presence(server?.libraryPath)],
      ["scan phase", library.status.phase],
      ["scan error", library.status.errorCode],
      ["last scan", ageOf(library.lastScanAt)],
      [
        "last scan result",
        result
          ? `indexed ${result.indexed}, skipped ${result.skipped}, removed ${result.removed}, failed ${result.failed}, unreadable ${result.unreadable}, incomplete ${result.incomplete}, cancelled ${result.cancelled}`
          : undefined,
      ],
    ],
  };
}

function integrationsSection(): ReportSection {
  const lastFm = useLastFm.getState();
  const listenBrainz = useListenBrainz.getState();
  const audioMuse = useAudioMuse.getState();
  const abs = useAudiobookshelf.getState();
  const tidarr = useTidarr.getState();
  const musicBrainz = useMusicBrainz.getState();
  const podcasts = usePodcastsBase.getState();
  return {
    title: "Integrations",
    rows: [
      ["last.fm connected", !!lastFm.sessionKey],
      ["last.fm session invalid", lastFm.sessionInvalid],
      ["last.fm scrobbling", lastFm.scrobblingEnabled],
      ["last.fm now playing", lastFm.submitNowPlaying],
      ["last.fm sync loves", lastFm.syncLoves],
      ["last.fm server scrobbling", lastFm.serverIsScrobbling],
      ["last.fm queued scrobbles", lastFm.queue.length],
      ["listenbrainz connected", !!listenBrainz.token],
      [
        "listenbrainz custom instance",
        listenBrainz.baseUrl !== LISTENBRAINZ_DEFAULT_BASE_URL,
      ],
      ["listenbrainz scrobbling", listenBrainz.scrobblingEnabled],
      ["listenbrainz now playing", listenBrainz.submitNowPlaying],
      ["listenbrainz server scrobbling", listenBrainz.serverIsScrobbling],
      ["listenbrainz queued listens", listenBrainz.queue.length],
      ["audiomuse connected", audioMuse.isConnected],
      ["audiomuse version", audioMuse.serverVersion],
      ["audiobookshelf connected", abs.isConnected],
      ["audiobookshelf version", abs.serverVersion],
      ["lidarr connected", useLidarr.getState().isConnected],
      ["soulsync connected", useSoulSync.getState().isConnected],
      ["tidarr connected", tidarr.isConnected],
      ["tidarr quality", tidarr.quality],
      ...(getCapabilities(useAuthBase.getState().serverType).tagWriting
        ? ([
            ["musicbrainz tag write mode", musicBrainz.tagWriteMode],
            ["musicbrainz auto apply", musicBrainz.autoApplyEnabled],
            [
              "musicbrainz auto apply threshold",
              musicBrainz.autoApplyThreshold,
            ],
          ] as ReportRow[])
        : []),
      ["taddy configured", presence(podcasts.taddyPodcastsApiKey) === "set"],
      ["taddy language", podcasts.taddyPodcastsLanguage],
    ],
  };
}

// Everything known to point back at this person or their setup. The sections
// above never print any of it on purpose; the scrub catches an accident.
function identifyingStrings(): string[] {
  const deviceDescription = new Set(
    [Device.modelName, Device.manufacturer, Device.brand, Device.osName]
      .filter((value): value is string => !!value)
      .map((value) => value.toLowerCase()),
  );
  const auth = useAuthBase.getState();
  const { servers, users } = useServersBase.getState();
  const integrationUrls = [
    useLidarr.getState().serverUrl,
    useSoulSync.getState().serverUrl,
    useTidarr.getState().serverUrl,
    useAudioMuse.getState().serverUrl,
    useAudiobookshelf.getState().serverUrl,
    useListenBrainz.getState().baseUrl,
  ];
  const urls = [
    auth.url,
    ...servers.flatMap((s) => [s.url, s.fallbackUrl, s.oidc?.issuer]),
    ...integrationUrls,
  ];
  return [
    auth.username,
    auth.serverId,
    auth.userId,
    auth.jellyfinUserId,
    useLastFm.getState().userName,
    useListenBrainz.getState().userName,
    useAudiobookshelf.getState().username,
    ...users.map((u) => u.username),
    ...servers.flatMap((s) => [
      s.id,
      s.name,
      s.mtlsAlias,
      s.libraryPath,
      ...(s.paths ?? []),
      ...Object.entries(s.headers ?? {}).flat(),
    ]),
    ...urls.map(hostOf),
    Device.deviceName,
  ].filter(
    (value): value is string =>
      typeof value === "string" &&
      !GENERIC_STRINGS.has(value.trim().toLowerCase()) &&
      !deviceDescription.has(value.trim().toLowerCase()),
  );
}

export function buildBugReport(): string {
  const sections = [
    safely("App", appSection),
    safely("Device", deviceSection),
    safely("Server", serverSection),
    safely("Capabilities", capabilitiesSection),
    safely("Network", networkSection),
    safely("Indexed library", localLibrarySection),
    safely("Downloads & offline", offlineSection),
    safely("Integrations", integrationsSection),
    safely("Settings", settingsSection),
  ];
  let secrets: string[] = [];
  try {
    secrets = identifyingStrings();
  } catch {}
  return scrubReport(formatReport(sections), secrets);
}
