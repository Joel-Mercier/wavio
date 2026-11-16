const mockListChildren = jest.fn();
let mockOnline = true;
let mockScope = "scope-a";

jest.mock("@/services/carAuto/providers", () => ({
  listChildren: (...args: unknown[]) => mockListChildren(...args),
}));
jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
}));
jest.mock("@/stores/auth", () => ({
  currentAuthScope: () => mockScope,
}));
jest.mock("@/services/carAuto/nodes", () => ({
  t: (key: string) => key,
}));

type BrowseModule = typeof import("@/services/carAuto/browse");
let browse: BrowseModule;

beforeEach(() => {
  jest.resetModules();
  mockListChildren.mockReset();
  mockOnline = true;
  mockScope = "scope-a";
  browse = require("@/services/carAuto/browse");
});

const listing = (id: string) => ({
  nodes: [{ id, title: id, playable: true }],
  tracks: [{ id, url: "" }],
});

describe("car browse engine", () => {
  it("loads a parent once and serves repeats from the cache", async () => {
    mockListChildren.mockResolvedValue(listing("a"));

    await browse.getChildren("album:1");
    await browse.getChildren("album:1");

    expect(mockListChildren).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent opens", async () => {
    mockListChildren.mockResolvedValue(listing("a"));

    await Promise.all([
      browse.getChildren("album:1"),
      browse.getChildren("album:1"),
    ]);

    expect(mockListChildren).toHaveBeenCalledTimes(1);
  });

  it("refetches when asked for a fresh listing", async () => {
    mockListChildren.mockResolvedValue(listing("a"));

    await browse.getChildren("album:1");
    await browse.getChildren("album:1", { fresh: true });

    expect(mockListChildren).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the last listing when a refresh fails", async () => {
    mockListChildren.mockResolvedValueOnce(listing("a"));
    await browse.getChildren("album:1");
    mockListChildren.mockRejectedValueOnce(new Error("down"));

    const nodes = await browse.getChildren("album:1", { fresh: true });

    expect(nodes?.[0].id).toBe("a");
  });

  it("points at downloads when offline with nothing cached", async () => {
    mockOnline = false;
    mockListChildren.mockRejectedValue(new Error("offline"));

    const nodes = await browse.getChildren("album:1");

    expect(nodes?.[0].id).toBe("section:downloads");
  });

  it("answers null online when the load fails and nothing is cached", async () => {
    mockListChildren.mockRejectedValue(new Error("500"));

    expect(await browse.getChildren("album:1")).toBeNull();
  });

  it("never serves one account's listing to another", async () => {
    mockListChildren.mockResolvedValue(listing("a"));
    await browse.getChildren("album:1");
    mockScope = "scope-b";
    mockListChildren.mockResolvedValue(listing("b"));

    const nodes = await browse.getChildren("album:1");

    expect(nodes?.[0].id).toBe("b");
  });

  it("drops a listing that was still loading when the account changed", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockListChildren.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = browse.getChildren("album:1");
    mockScope = "scope-b";
    resolve(listing("a"));

    expect(await pending).toBeNull();
    expect(browse.cachedListing("album:1")).toBeUndefined();
  });

  it("drops a listing that was still loading when the cache was cleared", async () => {
    let resolve: (value: unknown) => void = () => {};
    mockListChildren.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = browse.getChildren("album:1");
    browse.clearListings();
    resolve(listing("old"));

    expect(await pending).toBeNull();
    expect(browse.cachedListing("album:1")).toBeUndefined();
  });

  it("patches matching nodes and reports which parents changed", async () => {
    mockListChildren.mockResolvedValue(listing("x"));
    await browse.getChildren("album:1");
    await browse.getChildren("playlist:1");

    const changed = browse.patchNodes(
      (node) => node.id === "x",
      (node) => ({ ...node, title: "patched" }),
    );

    expect(changed.sort()).toEqual(["album:1", "playlist:1"]);
    expect(browse.cachedListing("album:1")?.nodes[0].title).toBe("patched");
  });

  it("exposes a parent's full track list for a tap", async () => {
    mockListChildren.mockResolvedValue(listing("a"));

    expect(await browse.getTracks("album:1")).toEqual({
      tracks: [{ id: "a", url: "" }],
      source: undefined,
    });
  });
});
