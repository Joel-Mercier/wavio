import type { MusicFolder } from "@/services/openSubsonic/types";
import {
  reconcileMusicFolderSelection,
  summarizeMusicFolderNames,
  toggleMusicFolder,
} from "@/utils/musicFolderSelection";

const folders: MusicFolder[] = [
  { id: 1, name: "Music" },
  { id: 2, name: "Audiobooks" },
  { id: 3, name: "Classical" },
];

describe("reconcileMusicFolderSelection", () => {
  it("keeps a Subsonic selection that still exists on the server", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "opensubsonic",
        multiSelect: false,
        current: ["2"],
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("keeps the Subsonic 'all libraries' selection (undefined)", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "opensubsonic",
        multiSelect: false,
        current: undefined,
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("clears a stale Subsonic selection back to 'all libraries'", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        multiSelect: true,
        current: ["99"],
        folders,
      }),
    ).toEqual({ action: "set", ids: undefined });
  });

  it("keeps a multi-library Navidrome selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        multiSelect: true,
        current: ["1", "3"],
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("drops only the stale ids of a multi-library selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        multiSelect: true,
        current: ["1", "99", "3"],
        folders,
      }),
    ).toEqual({ action: "set", ids: ["1", "3"] });
  });

  it("keeps the first of several on a single-folder server", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "opensubsonic",
        multiSelect: false,
        current: ["3", "1"],
        folders,
      }),
    ).toEqual({ action: "set", ids: ["3"] });
  });

  it("keeps a valid Jellyfin selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        multiSelect: false,
        current: ["1"],
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("falls back to the first library for a stale Jellyfin selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        multiSelect: false,
        current: ["99"],
        folders,
      }),
    ).toEqual({ action: "set", ids: ["1"] });
  });

  it("seeds the first library when Jellyfin has no selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        multiSelect: false,
        current: undefined,
        folders,
      }),
    ).toEqual({ action: "set", ids: ["1"] });
  });

  it("keeps an unmatched Subsonic selection when the folder list is empty", () => {
    // An empty list means the request returned no folders; don't thrash the
    // selection — the reconciliation only fires on a confirmed list anyway.
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        multiSelect: true,
        current: undefined,
        folders: [],
      }),
    ).toEqual({ action: "keep" });
  });

  it("keeps when Jellyfin has no libraries to fall back to", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        multiSelect: false,
        current: ["99"],
        folders: [],
      }),
    ).toEqual({ action: "keep" });
  });
});

describe("toggleMusicFolder", () => {
  const allIds = ["1", "2", "3"];

  it("narrows 'all libraries' to the tapped one", () => {
    expect(toggleMusicFolder(undefined, "2", allIds)).toEqual(["2"]);
  });

  it("adds a library in the server's order", () => {
    expect(toggleMusicFolder(["3"], "1", allIds)).toEqual(["1", "3"]);
  });

  it("removes a ticked library", () => {
    expect(toggleMusicFolder(["1", "3"], "3", allIds)).toEqual(["1"]);
  });

  it("comes back to 'all libraries' when the last one is un-ticked", () => {
    expect(toggleMusicFolder(["2"], "2", allIds)).toBeUndefined();
  });

  it("comes back to 'all libraries' when every one is ticked", () => {
    expect(toggleMusicFolder(["1", "2"], "3", allIds)).toBeUndefined();
  });
});

describe("summarizeMusicFolderNames", () => {
  it("joins every name that fits", () => {
    expect(
      summarizeMusicFolderNames(["Music Library", "Audiobooks"], ", ", 26),
    ).toEqual({ text: "Music Library, Audiobooks", hiddenCount: 0 });
  });

  it("counts the names past the budget", () => {
    expect(
      summarizeMusicFolderNames(
        ["Music Library", "Audiobooks", "Classical"],
        ", ",
        26,
      ),
    ).toEqual({ text: "Music Library, Audiobooks", hiddenCount: 1 });
  });

  it("keeps a first name longer than the budget whole", () => {
    expect(
      summarizeMusicFolderNames(
        ["Classical and Contemporary Orchestral Recordings", "Audiobooks"],
        ", ",
        26,
      ),
    ).toEqual({
      text: "Classical and Contemporary Orchestral Recordings",
      hiddenCount: 1,
    });
  });

  it("stops at the first name that doesn't fit, keeping the order", () => {
    expect(
      summarizeMusicFolderNames(
        ["Singles", "Classical works", "Jazz"],
        ", ",
        20,
      ),
    ).toEqual({ text: "Singles", hiddenCount: 2 });
  });

  it("is empty for no names", () => {
    expect(summarizeMusicFolderNames([], ", ", 26)).toEqual({
      text: "",
      hiddenCount: 0,
    });
  });
});
