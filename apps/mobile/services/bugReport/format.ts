import type { useAppBase } from "@/stores/app";

// The report is pasted into a public GitHub issue, so every value in it is
// either a closed set (enums, booleans, numbers, version strings) or reduced to
// whether it is set or how many there are. Nothing free-form the user typed or
// picked (URLs, names, folders, ids, header names) is ever printed as-is, and
// `scrubReport` runs over the finished text as a second line of defence.

export type ReportValue = string | number | boolean | null | undefined;
export type ReportRow = [label: string, value: ReportValue];
export type ReportSection = { title: string; rows: ReportRow[] };

type AppState = ReturnType<typeof useAppBase.getState>;
type AppSettingKey = {
  [K in keyof AppState]: AppState[K] extends (...args: never[]) => unknown
    ? never
    : K;
}[keyof AppState];

// "value" prints the setting, "presence" only whether it is set, "count" only
// how many entries it holds, "omit" leaves it out. Typed as an exhaustive
// record, so a new app setting fails the typecheck until it is classified here.
type FieldRule = "value" | "presence" | "count" | "omit";

export const APP_SETTING_RULES: Record<AppSettingKey, FieldRule> = {
  locale: "value",
  showDrawer: "omit",
  showAddTab: "value",
  showEmptyHomeSections: "value",
  hiddenHomeSections: "value",
  homeSectionOrder: "value",
  pinFavoritesShortcut: "value",
  homeShortcutsCount: "value",
  lyricsSource: "value",
  karaokeEnabled: "value",
  karaokeWordFill: "value",
  lyricsTranslationLang: "value",
  lyricsShowPronunciation: "value",
  lyricsKeepScreenOn: "value",
  playerInlineLyrics: "value",
  waveformSeekbarEnabled: "value",
  librarySort: "value",
  libraryFilter: "value",
  playlistFolderDetection: "value",
  playlistFolderSeparator: "value",
  genresSort: "value",
  albumScreenLayouts: "value",
  favoritesSort: "value",
  allTracksSort: "value",
  allAlbumsSort: "value",
  allArtistsSort: "value",
  downloadsSort: "value",
  maxBitRate: "value",
  cellularMaxBitRate: "value",
  streamingFormat: "value",
  cellularStreamingFormat: "value",
  downloadsWifiOnly: "value",
  downloadFormat: "value",
  downloadMaxBitRate: "value",
  downloadLocationUri: "presence",
  trackCacheEnabled: "value",
  trackCacheCount: "value",
  trackCacheBudgetMb: "value",
  trackCacheOnCellular: "value",
  autoSignOutOnServerUnreachable: "value",
  http3Enabled: "value",
  autoBackupEnabled: "value",
  autoBackupMinuteOfDay: "value",
  autoBackupFolderUri: "presence",
  autoBackupKeepCount: "value",
  scanOnWifiOnly: "value",
  searchAllLibraries: "value",
  autoLibrarySync: "value",
  autoLibrarySyncIntervalMinutes: "value",
  albumArtNames: "count",
  artistArtNames: "count",
  replayGainMode: "value",
  replayGainPreampDb: "value",
  podcastPlaybackRate: "value",
  endlessPlaybackEnabled: "value",
  sleepTimerFinishTrack: "value",
  sleepTimerLastCustomMinutes: "value",
  showPlayerAudioQuality: "value",
  showPlayerRating: "value",
  mediaControlsLeft: "value",
  mediaControlsRight: "value",
  queueSyncPriority: "value",
  radioBrowserEnabled: "value",
  hapticFeedbackEnabled: "value",
  swipeLeftAction: "value",
  internetRadioCountryCode: "presence",
  internetRadioFeedTags: "count",
  autoUpdateCheckEnabled: "value",
  lastDismissedUpdateVersion: "value",
  lastUpdateCheckAt: "omit",
  orientation: "value",
  windowWidth: "value",
  isWideLayout: "value",
};

export const presence = (value: unknown): string => {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "string" && !value.trim()) return "not set";
  return "set";
};

const countOf = (value: unknown): number => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return 0;
};

const stringify = (value: unknown): ReportValue => {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") return JSON.stringify(value);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
};

const ORIENTATIONS = [
  "unknown",
  "portraitUp",
  "portraitDown",
  "landscapeLeft",
  "landscapeRight",
];

const READABLE: Partial<
  Record<AppSettingKey, (value: unknown) => ReportValue>
> = {
  orientation: (value) =>
    typeof value === "number" ? (ORIENTATIONS[value] ?? value) : undefined,
  windowWidth: (value) =>
    typeof value === "number" ? Math.round(value) : undefined,
};

export function describeAppSettings(state: object): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const [key, rule] of Object.entries(APP_SETTING_RULES)) {
    const value = (state as Record<string, unknown>)[key];
    const readable = READABLE[key as AppSettingKey];
    if (rule === "value") {
      rows.push([key, readable ? readable(value) : stringify(value)]);
    } else if (rule === "presence") rows.push([key, presence(value)]);
    else if (rule === "count") rows.push([`${key} (count)`, countOf(value)]);
  }
  return rows;
}

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

// What kind of address the server sits behind, without the address itself:
// enough to tell a LAN-only setup, a Tailscale/CGNAT one or a public domain
// apart, which is most of what a connectivity bug turns on.
export function describeServerAddress(url: string | undefined): ReportRow[] {
  if (!url?.trim()) return [["address", "none"]];
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return [["address", "unparseable"]];
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  let kind: string;
  if (host === "localhost") kind = "localhost";
  else if (IPV4.test(host)) {
    kind = PRIVATE_IPV4.some((re) => re.test(host))
      ? "private IPv4"
      : "public IPv4";
  } else if (host.includes(":")) {
    kind = /^(fc|fd|fe80|::1)/.test(host) ? "private IPv6" : "public IPv6";
  } else if (host.endsWith(".local")) kind = "mDNS (.local)";
  else if (host.endsWith(".ts.net")) kind = "Tailscale hostname";
  else if (!host.includes(".")) kind = "single-label hostname";
  else kind = "domain name";
  const path = parsed.pathname.replace(/\/+$/, "");
  return [
    ["scheme", parsed.protocol.replace(/:$/, "")],
    ["host kind", kind],
    ["custom port", parsed.port ? "yes" : "no"],
    ["sub-path", path ? "yes" : "no"],
  ];
}

const formatValue = (value: ReportValue): string => {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string" && value !== value.trim()) {
    return JSON.stringify(value);
  }
  if (typeof value === "string" && !value) return '""';
  return String(value);
};

export function formatReport(sections: ReportSection[]): string {
  const body = sections
    .filter((section) => section.rows.length > 0)
    .map((section) => {
      const rows = section.rows
        .map(([label, value]) => `${label}: ${formatValue(value)}`)
        .join("\n");
      return `#### ${section.title}\n\n\`\`\`text\n${rows}\n\`\`\``;
    })
    .join("\n\n");
  return `<details>\n<summary>Wavio diagnostics</summary>\n\n${body}\n\n</details>\n`;
}

const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`<>]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const IPV4_RE = /\b\d{1,3}(\.\d{1,3}){3}\b/g;
const IPV6_RE = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;
const MAC_RE = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi;

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ROW_RE = /^([^:\n]+): (.*)$/;

// Last pass over the finished text. `secrets` are the strings known to identify
// this user (username, server names, hostnames, ids): any occurrence in a value
// is masked even if a value that should have been closed-set somehow carried
// one. Labels and headings are fixed strings, so they are left alone: a server
// or account that happens to share a word with them must not mangle the report.
export function scrubReport(text: string, secrets: string[]): string {
  const scrubbed = text
    .replace(URL_RE, "<url>")
    .replace(EMAIL_RE, "<email>")
    .replace(MAC_RE, "<mac>")
    .replace(IPV6_RE, "<ip>")
    .replace(IPV4_RE, (match) =>
      match.split(".").every((part) => Number(part) <= 255) ? "<ip>" : match,
    );
  const unique = [
    ...new Set(secrets.map((s) => s.trim()).filter((s) => s.length >= 4)),
  ].sort((a, b) => b.length - a.length);
  if (!unique.length) return scrubbed;
  const pattern = new RegExp(
    `(?<![a-z0-9])(?:${unique.map(escapeRegExp).join("|")})(?![a-z0-9])`,
    "gi",
  );
  return scrubbed
    .split("\n")
    .map((line) => {
      const row = ROW_RE.exec(line);
      return row ? `${row[1]}: ${row[2].replace(pattern, "<redacted>")}` : line;
    })
    .join("\n");
}
