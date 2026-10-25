// Subsonic createShare has no format/maxBitRate parameter, so a transcoded share
// link (issue #261) is created through Navidrome's native /api/share, while
// every other share keeps going through Subsonic. The native endpoint answers
// with the id alone; the public URL still has to come from getShares.
const mockSubsonicRequest = jest.fn();

jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    createThrottledScopedJSONStorage: () =>
      jest.requireActual("zustand/middleware").createJSONStorage(() => make()),
    flushPendingScopedWrites: () => {},
    getAuthScope: () => "scope",
  };
});

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

jest.mock("@/services/navidrome/auth", () => ({
  reauthenticateNavidrome: jest.fn(),
  nativeLogin: jest.fn(),
}));

jest.mock("@/services/openSubsonic", () => ({
  __esModule: true,
  default: {},
  subsonicRequest: (...args: unknown[]) => mockSubsonicRequest(...args),
}));

import { createShare, updateShare } from "@/services/backend/sharing";
import navidromeApiInstance from "@/services/navidrome";
import { useAuthBase } from "@/stores/auth";

const mockPost = jest.spyOn(navidromeApiInstance, "post");

const transcode = { format: "mp3", maxBitRate: 192 };

beforeEach(() => {
  mockPost.mockReset();
  mockSubsonicRequest.mockReset();
  useAuthBase.setState({ serverType: "navidrome", hasNavidromeNative: true });
});

describe("createShare", () => {
  it("creates a transcoded share on the native API and returns its listing", async () => {
    mockPost.mockResolvedValue({ data: { id: "new" } } as never);
    mockSubsonicRequest.mockResolvedValue({
      status: "ok",
      shares: {
        share: [
          { id: "old", url: "https://nd/share/old" },
          { id: "new", url: "https://nd/share/new" },
        ],
      },
    });

    const rsp = await createShare("album-1", { transcode });

    expect(mockPost).toHaveBeenCalledWith("/share", {
      resourceIds: "album-1",
      format: "mp3",
      maxBitRate: 192,
    });
    expect(mockSubsonicRequest).toHaveBeenCalledWith("/rest/getShares");
    expect(rsp.shares.share?.map((share) => share.url)).toEqual([
      "https://nd/share/new",
    ]);
  });

  it("fails when the created share is missing from the listing", async () => {
    mockPost.mockResolvedValue({ data: { id: "new" } } as never);
    mockSubsonicRequest.mockResolvedValue({ status: "ok", shares: {} });

    await expect(createShare("album-1", { transcode })).rejects.toThrow();
  });

  it("keeps an original-format share on Subsonic createShare", async () => {
    mockSubsonicRequest.mockResolvedValue({ status: "ok", shares: {} });

    await createShare("album-1", {});

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSubsonicRequest).toHaveBeenCalledWith(
      "/rest/createShare",
      expect.objectContaining({ id: "album-1" }),
    );
  });

  it("sends downloadable on the native API", async () => {
    mockPost.mockResolvedValue({ data: { id: "new" } } as never);
    mockSubsonicRequest.mockResolvedValue({
      status: "ok",
      shares: { share: [{ id: "new", url: "https://nd/share/new" }] },
    });

    await createShare("album-1", { transcode, downloadable: true });

    expect(mockPost.mock.calls[0][1]).toMatchObject({ downloadable: true });
  });

  it("sends downloadable on Subsonic createShare", async () => {
    mockSubsonicRequest.mockResolvedValue({ status: "ok", shares: {} });

    await createShare("album-1", { downloadable: true });

    expect(mockSubsonicRequest).toHaveBeenCalledWith(
      "/rest/createShare",
      expect.objectContaining({ id: "album-1", downloadable: true }),
    );
  });

  it("ignores transcode options without the native session", async () => {
    useAuthBase.setState({ hasNavidromeNative: false });
    mockSubsonicRequest.mockResolvedValue({ status: "ok", shares: {} });

    await createShare("album-1", { transcode });

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSubsonicRequest.mock.calls[0][0]).toBe("/rest/createShare");
  });
});

describe("updateShare", () => {
  it("sends downloadable on Subsonic updateShare", async () => {
    mockSubsonicRequest.mockResolvedValue({ status: "ok" });

    await updateShare("share-1", { downloadable: false });

    expect(mockSubsonicRequest).toHaveBeenCalledWith(
      "/rest/updateShare",
      expect.objectContaining({ id: "share-1", downloadable: false }),
    );
  });
});
