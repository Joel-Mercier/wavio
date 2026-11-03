const FOLDER =
  "content://com.android.externalstorage.documents/tree/primary%3ABackups";

const mockNoBackup = new Map<string, string>();
type Observer = (name: string, changesStored: () => boolean) => void;
const mockObserver: { current: Observer | null } = { current: null };
// name -> uri, the backup folder's contents.
const mockFolder = new Map<string, string>();
const mockStaged = new Set<string>();
const mockAppStateListeners = new Set<(state: string) => void>();
const mockAppState = {
  currentState: "background",
  addEventListener: (_: string, listener: (state: string) => void) => {
    mockAppStateListeners.add(listener);
    return { remove: () => mockAppStateListeners.delete(listener) };
  },
};
const mockNative = {
  schedule: jest.fn(),
  cancel: jest.fn(),
  setPending: jest.fn(),
  pending: false,
  due: null as (() => void) | null,
  reportDone: jest.fn(),
  notifyReady: jest.fn(),
};
const mockWriteBackupFile = jest.fn(async (file: { uri: string }) => {
  mockStaged.add(file.uri);
});
const mockProbe = jest.fn((_uri: string) => true);
const mockReportError = jest.fn();

jest.mock("react-native", () => ({
  AppState: mockAppState,
  Platform: { OS: "android" },
}));

jest.mock("@/config/storage", () => ({
  getNoBackupStorage: () => ({
    getString: (k: string) => mockNoBackup.get(k),
    set: (k: string, v: string) => mockNoBackup.set(k, v),
  }),
  setPersistedWriteObserver: (observer: Observer | null) => {
    mockObserver.current = observer;
  },
  flushPendingScopedWrites: () => {},
}));

jest.mock("@/modules/auto-backup", () => ({
  isAutoBackupSchedulerAvailable: () => true,
  scheduleAutoBackup: (h: number, m: number) => mockNative.schedule(h, m),
  cancelAutoBackup: () => mockNative.cancel(),
  setAutoBackupPending: (p: boolean) => {
    mockNative.pending = p;
    mockNative.setPending(p);
  },
  isAutoBackupPending: () => mockNative.pending,
  onAutoBackupDue: (listener: () => void) => {
    mockNative.due = listener;
    return () => {};
  },
  notifyAutoBackupReady: () => mockNative.notifyReady(),
  reportAutoBackupDone: () => mockNative.reportDone(),
}));

jest.mock("@/modules/scan-service", () => ({
  isSafListAvailable: () => false,
  listDocuments: jest.fn(),
}));

jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(...segments: string[]) {
      this.uri = segments.join("/");
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf("/") + 1);
    }
    get exists() {
      return mockStaged.has(this.uri);
    }
    delete() {
      mockStaged.delete(this.uri);
      for (const [name, uri] of mockFolder) {
        if (uri === this.uri) mockFolder.delete(name);
      }
    }
    async copy(folder: { uri: string }) {
      mockFolder.set(this.name, `${folder.uri}/${this.name}`);
    }
  }
  class Directory {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    list() {
      return [...mockFolder.values()].map((uri) => new File(uri));
    }
  }
  return { File, Directory, Paths: { cache: "/cache" } };
});

jest.mock("@/services/backup", () => ({
  isBackupExcluded: (name: string) =>
    ["offlineMutations", "wavio-rq"].some((e) => name.startsWith(e)),
  timestampSlug: () =>
    `20261026-0300${String(mockFolder.size).padStart(2, "0")}`,
  writeBackupFile: (file: { uri: string }) => mockWriteBackupFile(file),
}));

jest.mock("@/services/backgroundTimer", () => ({
  setBackgroundTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearBackgroundTimer: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
}));

jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock("@/services/offline/downloadDestination", () => ({
  entryName: (uri: string) => uri.slice(uri.lastIndexOf("/") + 1),
}));

jest.mock("@/services/writableTree", () => ({
  probeWritableTree: (uri: string) => mockProbe(uri),
}));

jest.mock("@/stores/app", () => {
  const { create } = jest.requireActual("zustand");
  return {
    useAppBase: create(() => ({
      autoBackupEnabled: true,
      autoBackupMinuteOfDay: 3 * 60 + 30,
      autoBackupFolderUri: FOLDER,
      autoBackupKeepCount: 7,
    })),
  };
});

type Service = typeof import("@/services/autoBackup");
type AppStoreMock = {
  setState: (s: Record<string, unknown>) => void;
};

let service: Service;
let appStore: AppStoreMock;

function load() {
  jest.isolateModules(() => {
    service = require("@/services/autoBackup");
    appStore = require("@/stores/app").useAppBase;
  });
  service.startAutoBackupScheduler();
}

const write = (name: string, changesStored = true) =>
  mockObserver.current?.(name, () => changesStored);

const fireDue = async () => {
  mockNative.due?.();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNoBackup.clear();
  mockFolder.clear();
  mockStaged.clear();
  mockAppStateListeners.clear();
  mockAppState.currentState = "background";
  mockNative.pending = false;
  mockNative.due = null;
  mockObserver.current = null;
  mockProbe.mockImplementation(() => true);
});

describe("auto-backup scheduling", () => {
  it("schedules the chosen time and announces readiness", () => {
    load();
    expect(mockNative.schedule).toHaveBeenCalledWith(3, 30);
    expect(mockNative.notifyReady).toHaveBeenCalled();
  });

  it("cancels and stops tracking writes when turned off", () => {
    load();
    appStore.setState({ autoBackupEnabled: false });
    expect(mockNative.cancel).toHaveBeenCalled();
    expect(mockObserver.current).toBeNull();
  });

  it("treats turning it on as a change, so the first slot writes a backup", () => {
    load();
    appStore.setState({ autoBackupEnabled: false });
    appStore.setState({ autoBackupEnabled: true });
    expect(mockNative.pending).toBe(true);
  });
});

describe("change tracking", () => {
  it("raises the native flag once, on the first backed-up write", () => {
    load();
    write("bookmarks");
    write("playHistory");
    expect(mockNative.setPending).toHaveBeenCalledTimes(1);
    expect(mockNative.setPending).toHaveBeenCalledWith(true);
  });

  it("ignores a write that leaves the stored value as it was", () => {
    load();
    write("bookmarks", false);
    write("app", false);
    expect(mockNative.setPending).not.toHaveBeenCalled();
  });

  it("stops comparing once a change is pending", () => {
    load();
    write("bookmarks");
    const changesStored = jest.fn(() => true);
    mockObserver.current?.("playHistory", changesStored);
    expect(changesStored).not.toHaveBeenCalled();
  });

  it("ignores stores a backup leaves out", () => {
    load();
    write("oidc");
    write("offlineMutations");
    write('wavio-rq:["album"]');
    expect(mockNative.setPending).not.toHaveBeenCalled();
  });
});

describe("a due run", () => {
  it("writes the file into the folder and lowers the flag", async () => {
    load();
    write("bookmarks");
    await fireDue();
    expect(mockWriteBackupFile).toHaveBeenCalledTimes(1);
    expect([...mockFolder.keys()]).toEqual([
      "wavio-auto-backup-20261026-030000.json",
    ]);
    expect(mockNative.pending).toBe(false);
    expect(mockStaged.size).toBe(0);
    expect(mockNative.reportDone).toHaveBeenCalled();
    expect(
      JSON.parse(mockNoBackup.get("status") ?? "{}").lastSuccessAt,
    ).toEqual(expect.any(Number));
  });

  it("writes nothing when nothing changed, but still answers native", async () => {
    load();
    await fireDue();
    expect(mockWriteBackupFile).not.toHaveBeenCalled();
    expect(mockNative.reportDone).toHaveBeenCalled();
  });

  it("keeps the flag raised when a write lands during the run", async () => {
    load();
    write("bookmarks");
    mockWriteBackupFile.mockImplementationOnce(async (file) => {
      mockStaged.add(file.uri);
      write("playHistory");
    });
    await fireDue();
    expect(mockNative.pending).toBe(true);
  });

  it("lowers the flag when a write during the run changes nothing", async () => {
    load();
    write("bookmarks");
    mockWriteBackupFile.mockImplementationOnce(async (file) => {
      mockStaged.add(file.uri);
      write("playHistory", false);
    });
    await fireDue();
    expect(mockNative.pending).toBe(false);
  });

  it("waits for the app to be backgrounded when it comes due in use", async () => {
    load();
    write("bookmarks");
    mockAppState.currentState = "active";
    await fireDue();
    expect(mockNative.reportDone).toHaveBeenCalled();
    expect(mockWriteBackupFile).not.toHaveBeenCalled();
    for (const listener of [...mockAppStateListeners]) listener("background");
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockWriteBackupFile).toHaveBeenCalledTimes(1);
  });

  it("reports an unwritable folder without trying to write", async () => {
    load();
    write("bookmarks");
    mockProbe.mockImplementation(() => false);
    await fireDue();
    expect(mockWriteBackupFile).not.toHaveBeenCalled();
    expect(JSON.parse(mockNoBackup.get("status") ?? "{}").lastError).toBe(
      "folderUnavailable",
    );
    expect(mockNative.pending).toBe(true);
  });

  it("records a failure, keeps the flag and leaves no partial file", async () => {
    load();
    write("bookmarks");
    mockWriteBackupFile.mockImplementationOnce(async (file) => {
      mockStaged.add(file.uri);
      throw new Error("disk full");
    });
    await fireDue();
    expect(mockReportError).toHaveBeenCalled();
    expect(JSON.parse(mockNoBackup.get("status") ?? "{}").lastError).toBe(
      "failed",
    );
    expect(mockNative.pending).toBe(true);
    expect(mockFolder.size).toBe(0);
    expect(mockStaged.size).toBe(0);
  });
});

describe("retention", () => {
  it("follows the keep-count setting", async () => {
    for (let day = 10; day < 15; day += 1) {
      const name = `wavio-auto-backup-202610${day}-030000.json`;
      mockFolder.set(name, `${FOLDER}/${name}`);
    }
    load();
    appStore.setState({ autoBackupKeepCount: 2 });
    await service.runAutoBackup({ force: true });
    expect([...mockFolder.keys()].sort()).toEqual([
      "wavio-auto-backup-20261014-030000.json",
      "wavio-auto-backup-20261026-030005.json",
    ]);
  });

  it("keeps the newest backups and never touches other files", async () => {
    for (let day = 10; day < 20; day += 1) {
      const name = `wavio-auto-backup-202610${day}-030000.json`;
      mockFolder.set(name, `${FOLDER}/${name}`);
    }
    mockFolder.set("wavio-backup-20261001-1200.json", `${FOLDER}/manual`);
    mockFolder.set("notes.txt", `${FOLDER}/notes.txt`);
    load();
    await service.runAutoBackup({ force: true });
    const names = [...mockFolder.keys()].sort();
    const own = names.filter((n) => n.startsWith("wavio-auto-backup-"));
    expect(own).toHaveLength(7);
    expect(own).not.toContain("wavio-auto-backup-20261010-030000.json");
    expect(names).toContain("wavio-backup-20261001-1200.json");
    expect(names).toContain("notes.txt");
  });
});
