import type { MusicFolder } from "@/services/openSubsonic/types";
import { reconcileMusicFolderSelection } from "@/utils/musicFolderSelection";

const folders: MusicFolder[] = [
  { id: 1, name: "Music" },
  { id: 2, name: "Audiobooks" },
];

describe("reconcileMusicFolderSelection", () => {
  it("keeps a Subsonic selection that still exists on the server", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        current: "2",
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("keeps the Subsonic 'all libraries' selection (undefined)", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "opensubsonic",
        current: undefined,
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("clears a stale Subsonic selection back to 'all libraries'", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        current: "99",
        folders,
      }),
    ).toEqual({ action: "set", id: undefined });
  });

  it("keeps a valid Jellyfin selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        current: "1",
        folders,
      }),
    ).toEqual({ action: "keep" });
  });

  it("falls back to the first library for a stale Jellyfin selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        current: "99",
        folders,
      }),
    ).toEqual({ action: "set", id: "1" });
  });

  it("seeds the first library when Jellyfin has no selection", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        current: undefined,
        folders,
      }),
    ).toEqual({ action: "set", id: "1" });
  });

  it("keeps an unmatched Subsonic selection when the folder list is empty", () => {
    // An empty list means the request returned no folders; don't thrash the
    // selection — the reconciliation only fires on a confirmed list anyway.
    expect(
      reconcileMusicFolderSelection({
        serverType: "navidrome",
        current: undefined,
        folders: [],
      }),
    ).toEqual({ action: "keep" });
  });

  it("keeps when Jellyfin has no libraries to fall back to", () => {
    expect(
      reconcileMusicFolderSelection({
        serverType: "jellyfin",
        current: "99",
        folders: [],
      }),
    ).toEqual({ action: "keep" });
  });
});
