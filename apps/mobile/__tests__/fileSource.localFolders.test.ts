// The iOS local-library roots: what survives a relaunch is the bookmark, so the
// restore pass is what turns a stored grant back into a readable folder — and
// what forgets the grants nothing references any more.

const mockMem = new Map<string, string>();
jest.mock("@/config/storage", () => ({
  zustandStorage: {
    setItem: (k: string, v: string) => mockMem.set(k, v),
    getItem: (k: string) => mockMem.get(k) ?? null,
    removeItem: (k: string) => mockMem.delete(k),
  },
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("expo-application", () => ({ applicationName: "Wavio" }));

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

jest.mock("expo-file-system", () => ({
  Paths: { document: "file:///Docs" },
  Directory: class {
    uri: string;
    constructor(base: string, name: string) {
      this.uri = `${base}/${name}/`;
    }
    create() {}
  },
}));

const mockNative = {
  available: true,
  resolve: jest.fn<
    Promise<{
      uri: string;
      bookmark: string;
      name: string;
      stale: boolean;
    } | null>,
    [string]
  >(),
  pick: jest.fn<
    Promise<{ uri: string; bookmark: string; name: string } | null>,
    []
  >(),
};
jest.mock("@/modules/scoped-folders", () => ({
  isScopedFoldersAvailable: () => mockNative.available,
  resolveScopedFolder: (bookmark: string) => mockNative.resolve(bookmark),
  pickScopedFolder: () => mockNative.pick(),
}));

const mockServers: { servers: { paths?: string[] }[] } = { servers: [] };
jest.mock("@/stores/servers", () => ({
  __esModule: true,
  default: { getState: () => mockServers },
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

import { Platform } from "react-native";
import {
  __resetLocalFolders,
  addPickedFolder,
  localFolderLabel,
  localFolderPathLabel,
  restoreLocalFolders,
  withRequiredRoots,
} from "@/services/fileSource/localFolders";
import {
  __resetLocalFolderUris,
  setResolvedRoot,
  toFileUri,
} from "@/services/fileSource/localFolderUris";
import useScopedFolders from "@/stores/scopedFolders";

const setPlatform = (os: string) => {
  (Platform as { OS: string }).OS = os;
};

beforeEach(() => {
  __resetLocalFolders();
  __resetLocalFolderUris();
  mockMem.clear();
  mockNative.resolve.mockReset();
  mockNative.pick.mockReset();
  mockNative.available = true;
  setPlatform("ios");
  mockServers.servers = [];
  useScopedFolders.setState({ folders: {} });
});

describe("restoreLocalFolders", () => {
  it("always resolves the Music root, then every configured bookmark", async () => {
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "B1", label: "Rock" });
    mockServers.servers = [
      { paths: ["local-folder://music", "local-folder://abc"] },
    ];
    mockNative.resolve.mockResolvedValue({
      uri: "file:///Mounted/Rock",
      bookmark: "B1",
      name: "Rock",
      stale: false,
    });

    await restoreLocalFolders();

    expect(toFileUri("local-folder://music/a.flac")).toBe(
      "file:///Docs/Music/a.flac",
    );
    expect(toFileUri("local-folder://abc/b.flac")).toBe(
      "file:///Mounted/Rock/b.flac",
    );
    expect(mockNative.resolve).toHaveBeenCalledWith("B1");
  });

  it("persists a refreshed bookmark when the stored one went stale", async () => {
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "OLD", label: "Rock" });
    mockServers.servers = [{ paths: ["local-folder://abc"] }];
    mockNative.resolve.mockResolvedValue({
      uri: "file:///Mounted/Rock",
      bookmark: "NEW",
      name: "Rock",
      stale: true,
    });

    await restoreLocalFolders();

    expect(useScopedFolders.getState().folders.abc.bookmark).toBe("NEW");
  });

  it("forgets a bookmark no server references, but not one picked this session", async () => {
    useScopedFolders
      .getState()
      .setFolder("gone", { bookmark: "G", label: "Old" });
    useScopedFolders
      .getState()
      .setFolder("fresh", { bookmark: "F", label: "New" });
    setResolvedRoot("fresh", "file:///Mounted/New");
    mockServers.servers = [{ paths: ["local-folder://music"] }];
    mockNative.resolve.mockResolvedValue({
      uri: "file:///Mounted/New",
      bookmark: "F",
      name: "New",
      stale: false,
    });

    await restoreLocalFolders();

    expect(useScopedFolders.getState().folders).toEqual({
      fresh: { bookmark: "F", label: "New" },
    });
    expect(mockNative.resolve).toHaveBeenCalledTimes(1);
  });

  it("leaves a root unresolved when its folder is gone, keeping the bookmark for now", async () => {
    // The scan reports the root unreadable rather than pruning; the user sees
    // it in the folder list and can remove it, which drops the bookmark on the
    // next restore.
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "B1", label: "Rock" });
    mockServers.servers = [{ paths: ["local-folder://abc"] }];
    mockNative.resolve.mockResolvedValue(null);

    await restoreLocalFolders();

    expect(toFileUri("local-folder://abc/b.flac")).toBeNull();
    expect(useScopedFolders.getState().folders.abc).toBeDefined();
  });

  it("runs once per process and is a no-op off iOS", async () => {
    mockServers.servers = [{ paths: ["local-folder://abc"] }];
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "B1", label: "Rock" });
    mockNative.resolve.mockResolvedValue({
      uri: "file:///M",
      bookmark: "B1",
      name: "Rock",
      stale: false,
    });
    await Promise.all([restoreLocalFolders(), restoreLocalFolders()]);
    expect(mockNative.resolve).toHaveBeenCalledTimes(1);

    __resetLocalFolders();
    setPlatform("android");
    await restoreLocalFolders();
    expect(mockNative.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("addPickedFolder", () => {
  it("stores the grant under a fresh root id and resolves it immediately", async () => {
    mockNative.pick.mockResolvedValue({
      uri: "file:///iCloud/Jazz/",
      bookmark: "J",
      name: "Jazz",
    });

    expect(await addPickedFolder()).toBe("local-folder://uuid-1");
    expect(useScopedFolders.getState().folders["uuid-1"]).toEqual({
      bookmark: "J",
      label: "Jazz",
    });
    expect(toFileUri("local-folder://uuid-1/x.mp3")).toBe(
      "file:///iCloud/Jazz/x.mp3",
    );
    expect(localFolderLabel("local-folder://uuid-1")).toBe("Jazz");
  });

  it("keeps the existing root id when the same folder is picked again", async () => {
    setResolvedRoot("existing", "file:///iCloud/Jazz/");
    useScopedFolders
      .getState()
      .setFolder("existing", { bookmark: "old", label: "Jazz" });
    mockNative.pick.mockResolvedValue({
      uri: "file:///iCloud/Jazz",
      bookmark: "fresh",
      name: "Jazz",
    });

    expect(await addPickedFolder()).toBe("local-folder://existing");
    expect(useScopedFolders.getState().folders).toEqual({
      existing: { bookmark: "fresh", label: "Jazz" },
    });
  });

  it("returns null when the picker is dismissed", async () => {
    mockNative.pick.mockResolvedValue(null);
    expect(await addPickedFolder()).toBeNull();
    expect(useScopedFolders.getState().folders).toEqual({});
  });
});

describe("withRequiredRoots", () => {
  it("pins the Music root first on iOS and leaves Android lists alone", () => {
    expect(
      withRequiredRoots(["local-folder://abc", "local-folder://music"]),
    ).toEqual(["local-folder://music", "local-folder://abc"]);
    setPlatform("android");
    expect(withRequiredRoots(["content://tree/x"])).toEqual([
      "content://tree/x",
    ]);
  });
});

describe("localFolderLabel", () => {
  it("names the Music root through i18n and a picked root by its stored label", () => {
    expect(localFolderLabel("local-folder://music/sub")).toBe(
      "auth.login.localMusicFolder",
    );
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "B", label: "Rock" });
    expect(localFolderLabel("local-folder://abc")).toBe("Rock");
    expect(localFolderLabel("content://tree/x")).toBe("content://tree/x");
  });
});

describe("localFolderPathLabel", () => {
  it("prefixes a file's decoded path within the root with the root's label", () => {
    useScopedFolders
      .getState()
      .setFolder("abc", { bookmark: "B", label: "Rock" });
    expect(localFolderPathLabel("local-folder://abc/AC%20DC/01.flac")).toBe(
      "Rock/AC DC/01.flac",
    );
    expect(localFolderPathLabel("local-folder://abc")).toBe("Rock");
    expect(localFolderPathLabel("local-folder://music/a.mp3")).toBe(
      "auth.login.localMusicFolder/a.mp3",
    );
    expect(localFolderPathLabel("/storage/a.mp3")).toBe("/storage/a.mp3");
  });
});
