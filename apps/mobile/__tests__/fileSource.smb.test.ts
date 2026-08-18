// The SMB source, with the native module stubbed. What matters here is the
// translation layer either side of it: SMB directory entries become
// `RemoteEntry`s whose `path` is a credential-free `smb:` address, and every byte
// read is turned into an HTTP range against the loopback bridge — the same code
// path playback uses, which is why a scan exercises it too.

const mockNative = {
  bridgeUrl: jest.fn(
    (_target: unknown, path: string, _timeoutMs: number) =>
      `http://127.0.0.1:5555/tok${encodeURI(path)}`,
  ),
  list: jest.fn(),
  exists: jest.fn(),
  probe: jest.fn(),
};

jest.mock("@/modules/smb", () => ({
  isSmbAvailable: () => true,
  smbBridgeUrl: (target: unknown, path: string, timeoutMs: number) =>
    mockNative.bridgeUrl(target, path, timeoutMs),
  smbList: (target: unknown, path: string, timeoutMs: number) =>
    mockNative.list(target, path, timeoutMs),
  smbExists: (target: unknown, path: string, timeoutMs: number) =>
    mockNative.exists(target, path, timeoutMs),
  smbProbe: (target: unknown, timeoutMs: number) =>
    mockNative.probe(target, timeoutMs),
}));

const mockAuth = {
  url: "smb://nas.local/Music",
  username: "WORKGROUP\\joel",
  password: "hunter2",
  serverType: "smb",
};

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("axios", () => ({ get: jest.fn() }));

// playableUrl reports when it can't resolve a bridge URL. The real module
// reaches network → probe → jellyfin → MMKV, which doesn't load under jest.
const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import axios from "axios";
import { smbFileSource } from "@/services/fileSource/smb";

const mockGet = axios.get as unknown as jest.Mock;

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  name: "a.flac",
  isDirectory: false,
  size: 1234,
  mtime: 1700000000000,
  ...over,
});

beforeEach(() => {
  mockNative.list.mockReset();
  mockNative.exists.mockReset();
  mockNative.probe.mockReset();
  mockNative.bridgeUrl.mockClear();
  mockGet.mockReset();
  mockAuth.url = "smb://nas.local/Music";
  mockAuth.username = "WORKGROUP\\joel";
});

describe("smbFileSource", () => {
  it("is a network source with a smaller pool than WebDAV's", () => {
    expect(smbFileSource.kind).toBe("smb");
    // Every extracted file costs a bridge GET plus two ranged reads over one SMB
    // session, so it sits between the device's 4 and WebDAV's 12.
    expect(smbFileSource.extractConcurrency).toBe(6);
  });

  describe("target resolution", () => {
    it("splits the share out of the URL and the domain out of the username", async () => {
      mockNative.list.mockResolvedValue([]);

      await smbFileSource.list("smb:/Albums");

      expect(mockNative.list).toHaveBeenCalledWith(
        {
          host: "nas.local",
          port: 445,
          share: "Music",
          domain: "WORKGROUP",
          username: "joel",
          password: "hunter2",
        },
        "/Albums",
        expect.any(Number),
      );
    });

    it("leaves the domain empty for a plain username", async () => {
      mockAuth.username = "joel";
      mockNative.list.mockResolvedValue([]);

      await smbFileSource.list("smb:/");

      expect(mockNative.list.mock.calls[0][0]).toMatchObject({
        domain: "",
        username: "joel",
      });
    });

    it("carries a non-default port through", async () => {
      mockAuth.url = "smb://nas.local:1445/Media";
      mockNative.list.mockResolvedValue([]);

      await smbFileSource.list("smb:/");

      expect(mockNative.list.mock.calls[0][0]).toMatchObject({
        port: 1445,
        share: "Media",
      });
    });
  });

  describe("list", () => {
    it("addresses entries relative to the share, never the host", async () => {
      mockNative.list.mockResolvedValue([
        entry({ name: "Album", isDirectory: true, size: 0 }),
        entry({ name: "01 - Song.flac" }),
      ]);

      const entries = await smbFileSource.list("smb:/Albums");

      // No host and no credentials: the address is hex-encoded into a track id
      // that outlives the NAS's DHCP lease.
      expect(entries.map((e) => e.path)).toEqual([
        "smb:/Albums/Album",
        "smb:/Albums/01 - Song.flac",
      ]);
      expect(entries[0].isDirectory).toBe(true);
      expect(entries[1]).toMatchObject({ size: 1234, mtime: 1700000000000 });
    });

    it("does not double the slash at the share root", async () => {
      mockNative.list.mockResolvedValue([entry({ name: "Album" })]);

      const entries = await smbFileSource.list("smb:/");

      expect(entries[0].path).toBe("smb:/Album");
    });

    it("refuses another source's address", async () => {
      await expect(smbFileSource.list("webdav:/Music")).rejects.toThrow(
        /Not an SMB address/,
      );
      expect(mockNative.list).not.toHaveBeenCalled();
    });
  });

  describe("playableUrl", () => {
    it("hands back a loopback bridge URL", () => {
      expect(smbFileSource.playableUrl("smb:/Albums/01 - Song.flac")).toBe(
        "http://127.0.0.1:5555/tok/Albums/01%20-%20Song.flac",
      );
    });

    // It is called during a track change and cannot throw or yield.
    // The sync contract means it can't throw, so the only way this failure is
    // ever diagnosable is the report — downstream it becomes expo-audio's
    // opaque "Source error".
    it("degrades to the address when no share is configured, and reports it", () => {
      mockAuth.url = "smb://nas.local";
      expect(smbFileSource.playableUrl("smb:/a.flac")).toBe("smb:/a.flac");
      expect(mockReportError).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ backend: "smb", endpoint: "playableUrl" }),
      );
    });

    it("passes a foreign address straight through", () => {
      expect(smbFileSource.playableUrl("file:///storage/a.flac")).toBe(
        "file:///storage/a.flac",
      );
      expect(mockNative.bridgeUrl).not.toHaveBeenCalled();
    });
  });

  describe("openReader", () => {
    it("reads ranges over the bridge, with no credentials attached", async () => {
      mockGet.mockResolvedValue({
        status: 206,
        data: new Uint8Array([9]).buffer,
      });

      const reader = await smbFileSource.openReader("smb:/Albums/a.flac");
      await reader.read(100, 10);

      const [url, config] = mockGet.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:5555/tok/Albums/a.flac");
      expect(config.headers.Range).toBe("bytes=100-109");
      // The bridge authenticates on the token in its URL; the share's real
      // credentials never leave the native module.
      expect(config.headers.Authorization).toBeUndefined();
    });
  });

  describe("exists and probe", () => {
    it("reports what the native module says", async () => {
      mockNative.exists.mockResolvedValue(true);
      mockNative.probe.mockResolvedValue(true);

      expect(await smbFileSource.exists("smb:/Albums")).toBe(true);
      expect(await smbFileSource.probe()).toBe(true);
    });

    // Both feed reachability UI that runs on a timer, so neither may throw.
    // The scanner prunes tracks for a folder that reports absent, so `exists`
    // must never answer `false` for a link failure — only for a share that
    // positively said the path isn't there.
    it("throws rather than reporting absent when the share can't be reached", async () => {
      mockNative.exists.mockRejectedValue(
        Object.assign(new Error("nope"), { code: "ERR_SMB_UNREACHABLE" }),
      );

      await expect(smbFileSource.exists("smb:/Albums")).rejects.toMatchObject({
        code: "ERR_FS_UNREACHABLE",
      });
    });

    it("throws rather than reporting absent when credentials are rejected", async () => {
      mockNative.exists.mockRejectedValue(
        Object.assign(new Error("denied"), { code: "ERR_SMB_AUTH" }),
      );

      await expect(smbFileSource.exists("smb:/Albums")).rejects.toMatchObject({
        code: "ERR_FS_AUTH",
      });
    });

    it("reports absent only when the share says the path is gone", async () => {
      mockNative.exists.mockRejectedValue(
        Object.assign(new Error("no such path"), { code: "ERR_SMB_PATH" }),
      );

      expect(await smbFileSource.exists("smb:/Albums")).toBe(false);
    });

    it("maps an iOS dialect refusal to unsupported", async () => {
      mockNative.exists.mockRejectedValue(
        Object.assign(new Error("smb3 required"), { code: "ERR_SMB_DIALECT" }),
      );

      await expect(smbFileSource.exists("smb:/Albums")).rejects.toMatchObject({
        code: "ERR_FS_NOT_SUPPORTED",
      });
    });

    it("rejects a foreign address", async () => {
      await expect(
        smbFileSource.exists("file:///storage"),
      ).rejects.toMatchObject({ code: "ERR_FS_NOT_FOUND" });
      expect(mockNative.exists).not.toHaveBeenCalled();
    });

    // probe() is a yes/no by contract, so it keeps swallowing the reason.
    it("probe still degrades to false", async () => {
      mockNative.probe.mockRejectedValue(
        Object.assign(new Error("nope"), { code: "ERR_SMB_AUTH" }),
      );
      expect(await smbFileSource.probe()).toBe(false);
    });
  });

  describe("normalizeRoot", () => {
    it("turns the configured sub-path into an address", () => {
      expect(smbFileSource.normalizeRoot("/Albums")).toBe("smb:/Albums");
      expect(smbFileSource.normalizeRoot("")).toBe("smb:/");
    });
  });
});
