// getTopSongs is the one artist surface with two ways to name its subject. The
// display name is the Subsonic original and stays the fallback; an artist id is
// exact and, more usefully, something callers already hold. Callers pass both
// and let this decide, so the id path must drop the name rather than forward
// it: a name arriving late must not change the request that goes out.
const mockGetTopSongs = jest.fn();
let mockServerType = "opensubsonic";

jest.mock("@/services/backend/browsing", () => ({
  getTopSongs: (...args: unknown[]) => mockGetTopSongs(...args),
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ serverType: mockServerType }) },
}));

import { fetchTopSongs, supportsTopSongsById } from "@/services/topSongs";
import { useServerExtensionsBase } from "@/stores/serverExtensions";

const lastCall = () => mockGetTopSongs.mock.calls.at(-1);

beforeEach(() => {
  mockGetTopSongs.mockReset();
  mockGetTopSongs.mockResolvedValue({ topSongs: { song: [{ id: "s1" }] } });
  useServerExtensionsBase.getState().reset();
  mockServerType = "opensubsonic";
});

const advertiseExtension = () =>
  useServerExtensionsBase
    .getState()
    .setExtensions([{ name: "topSongsByArtistId", versions: [1] }]);

describe("supportsTopSongsById", () => {
  it("is false on a plain Subsonic server advertising nothing", () => {
    expect(supportsTopSongsById()).toBe(false);
  });

  it("is true once the server advertises the extension", () => {
    advertiseExtension();
    expect(supportsTopSongsById()).toBe(true);
  });

  it("is false for an unrelated advertised extension", () => {
    useServerExtensionsBase
      .getState()
      .setExtensions([{ name: "sonicSimilarity", versions: [1] }]);
    expect(supportsTopSongsById()).toBe(false);
  });

  it.each([
    "jellyfin",
    "local",
  ])("is true on %s without any extension", (type) => {
    mockServerType = type;
    expect(supportsTopSongsById()).toBe(true);
  });

  it("is false on navidrome before the extension is advertised", () => {
    // Navidrome only gained it in 0.64 — the static matrix must not assume it.
    mockServerType = "navidrome";
    expect(supportsTopSongsById()).toBe(false);
    advertiseExtension();
    expect(supportsTopSongsById()).toBe(true);
  });
});

describe("fetchTopSongs", () => {
  it("sends the id and no name when the server supports it", async () => {
    advertiseExtension();

    await fetchTopSongs({ id: "ar-1", name: "Nirvana", count: 10 });

    expect(lastCall()).toEqual(["", { count: 10, id: "ar-1" }]);
  });

  it("sends the name and no id when the server does not", async () => {
    await fetchTopSongs({ id: "ar-1", name: "Nirvana", count: 10 });

    expect(lastCall()).toEqual(["Nirvana", { count: 10 }]);
  });

  it("falls back to the name when the caller has no id", async () => {
    advertiseExtension();

    await fetchTopSongs({ name: "Nirvana", count: 10 });

    expect(lastCall()).toEqual(["Nirvana", { count: 10 }]);
  });

  it("returns a flat song list", async () => {
    await expect(fetchTopSongs({ name: "Nirvana" })).resolves.toEqual([
      { id: "s1" },
    ]);
  });

  it("returns an empty list when the server sends no songs", async () => {
    mockGetTopSongs.mockResolvedValue({ topSongs: {} });

    await expect(fetchTopSongs({ name: "Nirvana" })).resolves.toEqual([]);
  });

  it("does not call out when the id is unusable and there is no name", async () => {
    // Error 10 (missing parameter) is the only possible outcome, so skip it.
    await expect(fetchTopSongs({ id: "ar-1" })).resolves.toEqual([]);

    expect(mockGetTopSongs).not.toHaveBeenCalled();
  });

  it("propagates errors so the artist screen can surface them", async () => {
    mockGetTopSongs.mockRejectedValue(new Error("boom"));

    await expect(fetchTopSongs({ name: "Nirvana" })).rejects.toThrow("boom");
  });
});
