// A download destination the user picked is a folder full of their own files,
// reached over the Storage Access Framework. Two things about SAF make the
// naive implementation wrong in ways that only show up on a device: a
// `content://` URI can't be path-joined to reach a child, and `createDirectory`
// uniquifies instead of merging — so "find, then create" has to be atomic
// against the three downloads that run concurrently, or an album arrives split
// across `Album` and `Album (1)`.

const mockAppState: { downloadLocationUri: string | null } = {
  downloadLocationUri: null,
};

jest.mock("@/stores/app", () => ({
  useAppBase: { getState: () => mockAppState },
}));
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

const ROOT = "content://tree/primary%3AMusic";

// Minimal SAF-shaped filesystem: mockNodes are addressed by opaque URIs, children
// are reachable only by listing, and creating a directory that already exists
// produces a *second* one — exactly the provider behaviour being defended
// against.
// Minimal SAF-shaped filesystem. URIs mirror ExternalStorageProvider — the only
// provider that can realistically back a music folder — where a document id is
// `volume:relative/path`, percent-encoded into the URI. That shape is what makes
// a child's display name recoverable from its URI at all, so the mock has to
// reproduce it rather than invent opaque ids. Children are reachable only by
// listing, and creating a directory that already exists produces a *second*,
// uniquified one, exactly as the real provider does.
type Node = {
  uri: string;
  path: string;
  isDirectory: boolean;
  children: Node[];
};
const mockNodes = new Map<string, Node>();
let mockCreated: string[] = [];

const mockUriFor = (path: string) =>
  `${ROOT}/document/${encodeURIComponent(`primary:${path}`)}`;

const mockAddNode = (parent: Node, name: string, isDirectory: boolean) => {
  let finalName = name;
  for (
    let n = 1;
    mockNodes.has(mockUriFor(`${parent.path}/${finalName}`));
    n++
  ) {
    finalName = `${name} (${n})`;
  }
  const path = `${parent.path}/${finalName}`;
  const node: Node = { uri: mockUriFor(path), path, isDirectory, children: [] };
  mockNodes.set(node.uri, node);
  parent.children.push(node);
  return node;
};

jest.mock("expo-file-system", () => {
  const mockJoin = (uris: unknown[]) =>
    uris
      .map((u) =>
        typeof u === "object" && u !== null && "uri" in u
          ? String((u as { uri: string }).uri)
          : String(u),
      )
      .join("/");
  class Directory {
    uri: string;
    constructor(...uris: unknown[]) {
      this.uri = mockJoin(uris);
    }
    get exists() {
      return mockNodes.has(this.uri);
    }
    create() {}
    delete() {
      const node = mockNodes.get(this.uri);
      if (!node) return;
      mockNodes.delete(this.uri);
      for (const other of mockNodes.values()) {
        other.children = other.children.filter((c) => c.uri !== this.uri);
      }
    }
    list() {
      const node = mockNodes.get(this.uri);
      if (!node) throw new Error(`no such directory: ${this.uri}`);
      return node.children.map((child) =>
        child.isDirectory ? new Directory(child.uri) : new File(child.uri),
      );
    }
    createDirectory(name: string) {
      const node = mockNodes.get(this.uri);
      if (!node) throw new Error(`no such directory: ${this.uri}`);
      mockCreated.push(name);
      // SAF uniquifies rather than merging: a second create yields a new node.
      return new Directory(mockAddNode(node, name, true).uri);
    }
    createFile(name: string) {
      const node = mockNodes.get(this.uri);
      if (!node) throw new Error(`no such directory: ${this.uri}`);
      return new File(mockAddNode(node, name, false).uri);
    }
  }
  class File {
    uri: string;
    constructor(...uris: unknown[]) {
      this.uri = mockJoin(uris);
    }
    get exists() {
      return mockNodes.has(this.uri);
    }
    delete() {
      mockNodes.delete(this.uri);
      for (const other of mockNodes.values()) {
        other.children = other.children.filter((c) => c.uri !== this.uri);
      }
    }
  }
  return { Directory, File, Paths: { document: "/doc", cache: "/cache" } };
});

import { Directory } from "expo-file-system";
import { Platform } from "react-native";
import {
  downloadedFileIsOnPrimaryVolume,
  downloadedFileIsReadable,
  forgetCachedDirectory,
  isSupportedTreeUri,
  probeDownloadLocation,
  pruneEmptyAlbumFolders,
  resetDownloadDestinationCache,
  resolveTargetDirectory,
} from "@/services/offline/downloadDestination";
import {
  albumSegments,
  downloadedFileSuffix,
  exportFileName,
} from "@/services/offline/fileNaming";

const track = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Song",
  artist: "Artist",
  album: "Album",
  track: 5,
  ...over,
});

beforeEach(() => {
  // The setting is Android-only, so the external branch is unreachable under the
  // preset's default platform.
  Object.defineProperty(Platform, "OS", {
    value: "android",
    configurable: true,
  });
  mockNodes.clear();
  mockCreated = [];
  mockNodes.set(ROOT, {
    uri: ROOT,
    path: "Music",
    isDirectory: true,
    children: [],
  });
  mockAppState.downloadLocationUri = ROOT;
  resetDownloadDestinationCache();
});

describe("resolveTargetDirectory", () => {
  it("reuses an existing Artist/Album instead of letting SAF uniquify it", async () => {
    const first = await resolveTargetDirectory(track());
    resetDownloadDestinationCache();
    const second = await resolveTargetDirectory(track({ id: "t2" }));

    expect(second.uri).toBe(first.uri);
    // Two tracks from one album must not create four directories.
    expect(mockCreated).toEqual(["scope", "Artist", "Album"]);
  });

  it("creates each folder once when concurrent downloads race for it", async () => {
    const [a, b, c] = await Promise.all([
      resolveTargetDirectory(track({ id: "a" })),
      resolveTargetDirectory(track({ id: "b" })),
      resolveTargetDirectory(track({ id: "c" })),
    ]);

    expect(b.uri).toBe(a.uri);
    expect(c.uri).toBe(a.uri);
    expect(mockCreated).toEqual(["scope", "Artist", "Album"]);
  });

  it("never builds a child URI by path-joining the SAF root", async () => {
    const dir = await resolveTargetDirectory(track());
    // `new Directory(root, "Artist")` would produce exactly this, and no
    // DocumentsProvider can resolve it.
    expect(dir.uri).not.toBe(`${ROOT}/scope/Artist/Album`);
    expect(dir.uri).toBe(mockUriFor("Music/scope/Artist/Album"));
  });

  // The offline store is persisted per (server, user), so an unscoped tree would
  // let the same album saved from two servers resolve to one document — the
  // second download overwriting the first, and removing it on either server
  // deleting bytes the other still lists as downloaded.
  it("keeps two servers' trees apart under the one picked folder", async () => {
    const mine = await resolveTargetDirectory(track(), ROOT, "s1_joel");
    const theirs = await resolveTargetDirectory(track(), ROOT, "s2_joel");

    expect(mine.uri).toBe(mockUriFor("Music/s1_joel/Artist/Album"));
    expect(theirs.uri).toBe(mockUriFor("Music/s2_joel/Artist/Album"));
  });

  it("re-resolves a folder that disappeared underneath a failed write", async () => {
    const dir = await resolveTargetDirectory(track());
    // Deleted from a file manager, or the card it was on came back different.
    new Directory(dir.uri).delete();

    // Without the eviction the dead URI is handed back for as long as the app
    // runs, so every retry fails exactly the way the first one did.
    const stale = await resolveTargetDirectory(track());
    expect(mockNodes.has(stale.uri)).toBe(false);

    forgetCachedDirectory(track());
    const fresh = await resolveTargetDirectory(track());
    expect(mockNodes.has(fresh.uri)).toBe(true);
  });

  it("falls back to app-private storage when no folder is set", async () => {
    mockAppState.downloadLocationUri = null;
    resetDownloadDestinationCache();
    const dir = await resolveTargetDirectory(track());
    expect(dir.uri).toBe("/doc/offline/scope");
    expect(mockCreated).toEqual([]);
  });
});

describe("pruneEmptyAlbumFolders", () => {
  it("removes the folders a deleted track emptied but never the picked root", async () => {
    const dir = await resolveTargetDirectory(track());
    const file = dir.createFile("05 - Song.mp3", "audio/mpeg");

    file.delete();
    await pruneEmptyAlbumFolders(track());

    expect(mockNodes.has(dir.uri)).toBe(false);
    expect(mockNodes.has(ROOT)).toBe(true);
  });

  it("leaves an album alone while another track is still in it", async () => {
    const dir = await resolveTargetDirectory(track());
    dir.createFile("05 - Song.mp3", "audio/mpeg");
    const other = dir.createFile("06 - Other.mp3", "audio/mpeg");

    other.delete();
    await pruneEmptyAlbumFolders(track());

    expect(mockNodes.has(dir.uri)).toBe(true);
  });

  it("keeps walking out when the album folder is already gone", async () => {
    const dir = await resolveTargetDirectory(track());
    const artistUri = mockUriFor("Music/scope/Artist");
    // Removed outside the app, leaving the artist folder behind as a husk.
    new Directory(dir.uri).delete();

    await pruneEmptyAlbumFolders(track());

    expect(mockNodes.has(artistUri)).toBe(false);
    expect(mockNodes.has(ROOT)).toBe(true);
  });

  it("takes the scope folder with it once nothing is left under it", async () => {
    const dir = await resolveTargetDirectory(track());
    const file = dir.createFile("05 - Song.mp3", "audio/mpeg");

    file.delete();
    await pruneEmptyAlbumFolders(track());

    expect(mockNodes.has(mockUriFor("Music/scope"))).toBe(false);
    expect(mockNodes.has(ROOT)).toBe(true);
  });

  it("never touches another server's folder", async () => {
    const mine = await resolveTargetDirectory(track(), ROOT, "s1_joel");
    const theirs = await resolveTargetDirectory(track(), ROOT, "s2_joel");
    theirs.createFile("05 - Song.mp3", "audio/mpeg");

    await pruneEmptyAlbumFolders(track(), "s1_joel");

    expect(mockNodes.has(mine.uri)).toBe(false);
    expect(mockNodes.has(mockUriFor("Music/s1_joel"))).toBe(false);
    expect(mockNodes.has(theirs.uri)).toBe(true);
  });

  it("does nothing at all when downloads live in app storage", async () => {
    mockAppState.downloadLocationUri = null;
    resetDownloadDestinationCache();
    await pruneEmptyAlbumFolders(track());
    expect(mockNodes.has(ROOT)).toBe(true);
  });
});

describe("tree providers", () => {
  it("takes ExternalStorageProvider trees and nothing else", () => {
    // Its document ids are real paths, which is the only reason a folder name
    // can be read back out of a child URI. An opaque-id provider would make
    // every download create a fresh `Artist (n)`.
    expect(
      isSupportedTreeUri(
        "content://com.android.externalstorage.documents/tree/primary%3AMusic",
      ),
    ).toBe(true);
    expect(
      isSupportedTreeUri(
        "content://com.google.android.apps.docs.storage/tree/encoded%3D1",
      ),
    ).toBe(false);
  });
});

describe("downloadedFileIsOnPrimaryVolume", () => {
  it("separates the volume Paths measures from a removable card", () => {
    expect(downloadedFileIsOnPrimaryVolume("/doc/offline/scope/t1.mp3")).toBe(
      true,
    );
    // A picked folder on the device itself is still on that volume — the
    // setting alone can't tell you, only the path can.
    expect(
      downloadedFileIsOnPrimaryVolume(mockUriFor("Music/Artist/01 - A.mp3")),
    ).toBe(true);
    expect(
      downloadedFileIsOnPrimaryVolume(
        `${ROOT}/document/${encodeURIComponent("1A2B-3C4D:Music/Artist/01 - A.mp3")}`,
      ),
    ).toBe(false);
  });
});

describe("probeDownloadLocation", () => {
  it("reports a missing folder rather than throwing", async () => {
    expect(await probeDownloadLocation("content://tree/gone")).toBe(
      "unavailable",
    );
  });

  it("leaves no probe file behind on success", async () => {
    expect(await probeDownloadLocation(ROOT)).toBe("ok");
    expect(mockNodes.get(ROOT)?.children).toEqual([]);
  });
});

describe("downloadedFileIsReadable", () => {
  it("verifies a content:// path and only that", () => {
    expect(downloadedFileIsReadable("file:///doc/offline/scope/t1.mp3")).toBe(
      true,
    );
    expect(downloadedFileIsReadable(undefined)).toBe(true);
    expect(downloadedFileIsReadable("content://tree/gone/document/x")).toBe(
      false,
    );

    const present = mockNodes.get(ROOT);
    if (!present) throw new Error("root missing");
    const node = mockAddNode(present, "t1.mp3", false);
    expect(downloadedFileIsReadable(node.uri)).toBe(true);
  });

  // isPlayableNow asks per track and the skip-to-playable scans walk the whole
  // queue, so an ejected card must not cost one blocking ContentResolver query
  // per queue entry. Re-picking a folder is what invalidates the answer early.
  it("memoizes the probe until the destination cache is reset", () => {
    const path = mockUriFor("Music/t2.mp3");
    expect(downloadedFileIsReadable(path)).toBe(false);

    const present = mockNodes.get(ROOT);
    if (!present) throw new Error("root missing");
    expect(mockAddNode(present, "t2.mp3", false).uri).toBe(path);
    expect(downloadedFileIsReadable(path)).toBe(false);

    resetDownloadDestinationCache();
    expect(downloadedFileIsReadable(path)).toBe(true);
  });
});

describe("file naming", () => {
  it("numbers tracks and only prefixes the disc past the first", () => {
    expect(exportFileName(track(), "mp3")).toBe("05 - Song.mp3");
    expect(exportFileName(track({ discNumber: 1 }), "mp3")).toBe(
      "05 - Song.mp3",
    );
    expect(exportFileName(track({ discNumber: 2 }), "mp3")).toBe(
      "2-05 - Song.mp3",
    );
    expect(exportFileName(track({ track: undefined }), "flac")).toBe(
      "Song.flac",
    );
  });

  it("strips separators that SAF rejects in a child name", () => {
    expect(exportFileName(track({ title: "AC/DC: Live" }), "mp3")).toBe(
      "05 - ACDC Live.mp3",
    );
    expect(albumSegments(track({ artist: "A/B", album: undefined }))).toEqual([
      "AB",
      "Unknown album",
    ]);
  });

  it("resolves the album artist the same way from a Child and an OfflineTrack", () => {
    // The download writes into the folder derived from `displayAlbumArtist`;
    // deletion later works from the record, which persisted it as `albumArtist`.
    expect(albumSegments(track({ displayAlbumArtist: "Various" }))).toEqual([
      "Various",
      "Album",
    ]);
    expect(albumSegments(track({ albumArtist: "Various" }))).toEqual([
      "Various",
      "Album",
    ]);
  });

  it("prefers the recorded suffix over parsing a path", () => {
    expect(
      downloadedFileSuffix({
        path: "content://x/document/y",
        fileSuffix: "opus",
      }),
    ).toBe("opus");
    expect(downloadedFileSuffix({ path: "/doc/offline/scope/t1.mp3" })).toBe(
      "mp3",
    );
  });
});
