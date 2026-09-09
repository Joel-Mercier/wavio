// `maybeAutoScan` is what keeps an index-backed library in step with what's
// actually on disk without anyone pressing anything, so it fires on every
// foreground, every reconnect and on a timer. Everything interesting about it is
// therefore a reason *not* to run: it must not touch someone else's server, must
// not stack on a running scan, must not spend a data plan, and must not re-walk
// a large share because the user glanced at a notification.

const mockMem = new Map<string, string>();

jest.mock("@/config/storage", () => {
  const make = () => ({
    setItem: (k: string, v: string) => mockMem.set(k, v),
    getItem: (k: string) => mockMem.get(k) ?? null,
    removeItem: (k: string) => mockMem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mockMem.set(k, v),
      getString: (k: string) => mockMem.get(k) ?? null,
      remove: (k: string) => mockMem.delete(k),
      getAllKeys: () => [...mockMem.keys()],
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

// Resolves clean by default so the module's controller is released between
// cases; `hang` holds one scan open for the "don't stack another on top" case.
const hang = { value: false };
const cleanResult = {
  indexed: 0,
  skipped: 0,
  removed: 0,
  failed: 0,
  cancelled: false,
  incomplete: false,
  unreadable: 0,
  ignoredDirectories: 0,
  sidecarCovers: 0,
  artChanged: 0,
};
let releaseHeldScan: (() => void) | null = null;
const mockScanLibrary = jest.fn(
  (..._args: unknown[]) =>
    new Promise<typeof cleanResult>((resolve) => {
      if (!hang.value) {
        resolve({ ...cleanResult });
        return;
      }
      releaseHeldScan = () => resolve({ ...cleanResult });
    }),
);
jest.mock("@/services/local/indexer", () => ({
  createScanController: () => ({ cancelled: false, cancel: jest.fn() }),
  deleteTracksByFolders: jest.fn(),
  scanLibrary: (...args: unknown[]) => mockScanLibrary(...args),
}));

jest.mock("@/services/local/paths", () => ({ localFolders: () => ["/music"] }));

const network = { online: true, connection: "wifi" };
jest.mock("@/services/network", () => ({
  getConnectionType: () => network.connection,
  getIsEffectivelyOnline: () => network.online,
}));

const source = { kind: "webdav" };
jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => source,
}));

jest.mock("@/modules/scan-service", () => ({
  startScanService: jest.fn(),
  stopScanService: jest.fn(),
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: () => "" },
}));

// Same reason as the scanner suites: pulling the real one in loads the Sentry
// SDK, whose own cleanup interval keeps the jest run alive.
jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
  reportBreadcrumb: jest.fn(),
}));

const session = { serverType: "webdav" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => session },
  registerLogoutHandler: jest.fn(),
  currentAuthScope: () => "scope",
}));

import {
  __resetAutoScanThrottle,
  maybeAutoScan,
} from "@/services/local/mediaLibraryScanning";
import { useAppBase } from "@/stores/app";
import { registerLogoutHandler } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";

const HOUR = 60 * 60 * 1000;

const incompleteResult = {
  indexed: 0,
  skipped: 0,
  removed: 0,
  failed: 0,
  cancelled: false,
  incomplete: true,
  unreadable: 1,
  ignoredDirectories: 0,
  sidecarCovers: 0,
  artChanged: 0,
};

const setLibrary = (state: {
  ready?: boolean;
  lastScanAt?: number;
  incomplete?: boolean;
}) => {
  useLocalLibrary.setState({
    ready: state.ready ?? true,
    lastScanAt: state.lastScanAt,
    lastScanResult: state.incomplete ? incompleteResult : undefined,
    status: { phase: "idle", processed: 0, total: 0 },
  });
};

/** Let a resolved scan run its completion handlers and release the module. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

// A held scan would otherwise keep the run alive after the last case.
afterAll(async () => {
  releaseHeldScan?.();
  await settle();
});

beforeEach(async () => {
  hang.value = false;
  await settle();
  mockScanLibrary.mockClear();
  __resetAutoScanThrottle();
  network.online = true;
  network.connection = "wifi";
  source.kind = "webdav";
  session.serverType = "webdav";
  useAppBase.setState({
    autoLibrarySync: true,
    autoLibrarySyncIntervalMinutes: 30,
    scanOnWifiOnly: false,
  });
  setLibrary({ lastScanAt: Date.now() - HOUR });
});

describe("maybeAutoScan", () => {
  it("scans a library that hasn't been looked at since the interval", () => {
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
    // Never forced, and never through the gate: a scan nobody asked for must
    // not re-extract every file or take over the screen.
    expect(mockScanLibrary.mock.calls[0][1]).toMatchObject({ force: false });
  });

  it("leaves a server with no on-device index alone", () => {
    session.serverType = "navidrome";
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("waits for the store to rehydrate", () => {
    setLibrary({ ready: false, lastScanAt: Date.now() - HOUR });
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("leaves a never-scanned library to the first-login gate", () => {
    setLibrary({ lastScanAt: undefined });
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("doesn't re-walk a library scanned inside the interval", () => {
    setLibrary({ lastScanAt: Date.now() - 60_000 });
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("doesn't run when the setting is off", () => {
    useAppBase.setState({ autoLibrarySync: false });
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("doesn't walk a share it can't reach", () => {
    network.online = false;
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("still scans an on-device library while the network is down", () => {
    network.online = false;
    source.kind = "device";
    session.serverType = "local";
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
  });

  it("honours the Wi-Fi-only guard on a share", () => {
    useAppBase.setState({ scanOnWifiOnly: true });
    network.connection = "cellular";
    maybeAutoScan();
    expect(mockScanLibrary).not.toHaveBeenCalled();
  });

  it("resumes an incomplete scan whatever the interval and the setting say", () => {
    useAppBase.setState({ autoLibrarySync: false });
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
  });

  it("only resumes once per launch when the setting is off", async () => {
    // A folder that will never be readable leaves the library incomplete for
    // good. Finishing what it can is worth one attempt; doing it on every timer
    // tick is exactly what the user turned off.
    useAppBase.setState({
      autoLibrarySync: false,
      autoLibrarySyncIntervalMinutes: 0,
    });
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    await settle();
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
  });

  it("keeps resuming on the interval when the setting is on", async () => {
    useAppBase.setState({
      autoLibrarySync: true,
      autoLibrarySyncIntervalMinutes: 0,
    });
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    await settle();
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(2);
  });

  it("forgets the throttle on sign-out, so the next server syncs on its own clock", async () => {
    maybeAutoScan();
    await settle();
    setLibrary({ lastScanAt: Date.now() - HOUR });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);

    for (const [handler] of (registerLogoutHandler as jest.Mock).mock.calls) {
      handler();
    }
    setLibrary({ lastScanAt: Date.now() - HOUR });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(2);
  });

  it("doesn't resume an incomplete scan more often than the interval", async () => {
    // A folder the share will never let us read leaves the library incomplete
    // for good, which used to mean re-walking all of it on every foreground.
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    await settle();
    setLibrary({ lastScanAt: Date.now(), incomplete: true });
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
  });

  it("doesn't stack a second scan on a running one", () => {
    hang.value = true;
    maybeAutoScan();
    setLibrary({ lastScanAt: Date.now() - HOUR });
    __resetAutoScanThrottle();
    maybeAutoScan();
    expect(mockScanLibrary).toHaveBeenCalledTimes(1);
  });
});
