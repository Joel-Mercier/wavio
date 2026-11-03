import {
  folderAssignmentFor,
  groupPlaylistsIntoFolders,
  type PlaylistFolderOptions,
  playlistFolderRow,
  splitPlaylistName,
} from "@/utils/playlistFolders";

const playlist = (id: string, name: string, created?: string) => ({
  id,
  name,
  created,
});

const options = (
  overrides: Partial<PlaylistFolderOptions> = {},
): PlaylistFolderOptions => ({
  detect: true,
  separator: " - ",
  folders: {},
  assignments: {},
  ...overrides,
});

describe("splitPlaylistName", () => {
  it("splits on the first separator only", () => {
    expect(splitPlaylistName("rock - 80s - hair metal", " - ")).toEqual({
      folder: "rock",
      title: "80s - hair metal",
    });
  });

  it("keeps the separator inside the title", () => {
    expect(splitPlaylistName("rock / AC/DC", " / ")).toEqual({
      folder: "rock",
      title: "AC/DC",
    });
  });

  it("matches the separator literally, spaces included", () => {
    expect(splitPlaylistName("lo-fi beats", " - ")).toBeNull();
    expect(splitPlaylistName("best of 2020", " of ")).toEqual({
      folder: "best",
      title: "2020",
    });
  });

  it("rejects names with an empty half", () => {
    expect(splitPlaylistName(" - 80s", " - ")).toBeNull();
    expect(splitPlaylistName("rock - ", " - ")).toBeNull();
    expect(splitPlaylistName("rock", "")).toBeNull();
  });
});

describe("groupPlaylistsIntoFolders", () => {
  const playlists = [
    playlist("1", "rock - 80s"),
    playlist("2", "Rock - alt-rock"),
    playlist("3", "chill vibes"),
    playlist("4", "lo-fi beats"),
  ];

  it("leaves everything at the root with detection off and no folders", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({ detect: false }),
    );
    expect(result.rootPlaylists).toEqual(playlists);
    expect(result.folders).toEqual([]);
  });

  it("merges detected prefixes case-insensitively", () => {
    const result = groupPlaylistsIntoFolders(playlists, options());
    expect(result.rootPlaylists.map((p) => p.id)).toEqual(["3", "4"]);
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe("rock");
    expect(result.folders[0].members.map((m) => m.title)).toEqual([
      "80s",
      "alt-rock",
    ]);
  });

  it("joins detected playlists to a local folder of the same name", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        folders: { rock: { name: "Rock", color: "red", createdAt: 1 } },
      }),
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0]).toMatchObject({ name: "Rock", color: "red" });
    expect(result.folders[0].members).toHaveLength(2);
  });

  it("includes empty local folders", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        detect: false,
        folders: { jazz: { name: "Jazz", color: null, createdAt: 1 } },
      }),
    );
    expect(result.folders).toEqual([
      { key: "jazz", name: "Jazz", color: null, createdAt: 1, members: [] },
    ]);
  });

  it("lets an assignment override detection", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        folders: { chill: { name: "Chill", color: null, createdAt: 1 } },
        assignments: { "1": null, "2": "chill", "3": "chill" },
      }),
    );
    expect(result.rootPlaylists.map((p) => p.id)).toEqual(["1", "4"]);
    expect(result.folders).toHaveLength(1);
    // Moved out of its detected folder, so the full name is kept.
    expect(result.folders[0].members.map((m) => m.title)).toEqual([
      "Rock - alt-rock",
      "chill vibes",
    ]);
  });

  it("strips the prefix of a playlist pinned to its own detected folder", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        folders: { rock: { name: "rock", color: null, createdAt: 1 } },
        assignments: { "1": "rock" },
      }),
    );
    expect(result.folders[0].members[0].title).toBe("80s");
  });

  it("keeps a pinned playlist in its folder once detection is off", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        detect: false,
        folders: { rock: { name: "rock", color: null, createdAt: 1 } },
        assignments: { "1": "rock" },
      }),
    );
    expect(result.folders[0].members.map((m) => m.title)).toEqual([
      "rock - 80s",
    ]);
  });

  it("keeps detecting into a renamed folder, prefix stripped", () => {
    const result = groupPlaylistsIntoFolders(
      [...playlists, playlist("5", "rock - new wave")],
      options({
        folders: {
          "rock music": {
            name: "Rock music",
            color: null,
            createdAt: 1,
            renamedFrom: ["rock"],
          },
        },
        assignments: { "1": "rock music", "2": "rock music" },
      }),
    );
    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].members.map((m) => m.title)).toEqual([
      "80s",
      "alt-rock",
      "new wave",
    ]);
  });

  it("lets a folder of the old name win over a rename", () => {
    const result = groupPlaylistsIntoFolders(
      playlists,
      options({
        folders: {
          rock: { name: "Rock", color: null, createdAt: 2 },
          "rock music": {
            name: "Rock music",
            color: null,
            createdAt: 1,
            renamedFrom: ["rock"],
          },
        },
      }),
    );
    expect(
      result.folders.map((f) => [f.key, f.members.map((m) => m.title)]),
    ).toEqual([
      ["rock", ["80s", "alt-rock"]],
      ["rock music", []],
    ]);
  });

  it("falls back to detection when the assigned folder is gone", () => {
    const result = groupPlaylistsIntoFolders(
      [playlist("1", "rock - 80s"), playlist("3", "chill vibes")],
      options({ assignments: { "1": "jazz", "3": "jazz" } }),
    );
    expect(result.rootPlaylists.map((p) => p.id)).toEqual(["3"]);
    expect(result.folders.map((f) => f.key)).toEqual(["rock"]);
  });
});

describe("playlistFolderRow", () => {
  it("dates a detected folder by its newest playlist", () => {
    const row = playlistFolderRow({
      key: "rock",
      name: "rock",
      color: null,
      members: [
        {
          playlist: playlist("1", "a", "2024-01-01T00:00:00.000Z"),
          title: "a",
        },
        {
          playlist: playlist("2", "b", "2025-01-01T00:00:00.000Z"),
          title: "b",
        },
        { playlist: playlist("3", "c"), title: "c" },
      ],
    });
    expect(row).toEqual({
      id: "playlist-folder:rock",
      name: "rock",
      isPlaylistFolder: true,
      folderKey: "rock",
      folderColor: null,
      playlistCount: 3,
      created: "2025-01-01T00:00:00.000Z",
    });
  });

  it("adds up the members' track counts and durations", () => {
    const row = playlistFolderRow({
      key: "rock",
      name: "rock",
      color: null,
      members: [
        {
          playlist: { ...playlist("1", "a"), songCount: 3, duration: 600 },
          title: "a",
        },
        { playlist: { ...playlist("2", "b"), songCount: 2 }, title: "b" },
      ],
    });
    expect(row.songCount).toBe(5);
    expect(row.duration).toBe(600);
  });

  it("leaves the totals unset when no member reports them", () => {
    const row = playlistFolderRow({
      key: "rock",
      name: "rock",
      color: null,
      members: [{ playlist: playlist("1", "a"), title: "a" }],
    });
    expect(row.songCount).toBeUndefined();
    expect(row.duration).toBeUndefined();
  });

  it("dates a local folder by its creation", () => {
    const row = playlistFolderRow({
      key: "jazz",
      name: "Jazz",
      color: "blue",
      createdAt: Date.UTC(2023, 0, 1),
      members: [],
    });
    expect(row.created).toBe("2023-01-01T00:00:00.000Z");
    expect(row.playlistCount).toBe(0);
  });
});

describe("folderAssignmentFor", () => {
  it("pins moves into a folder", () => {
    expect(folderAssignmentFor(playlist("1", "chill"), "rock", " - ")).toBe(
      "rock",
    );
  });

  it("pins the root only for names that would be detected", () => {
    expect(folderAssignmentFor(playlist("1", "rock - 80s"), null, " - ")).toBe(
      null,
    );
    expect(
      folderAssignmentFor(playlist("1", "chill"), null, " - "),
    ).toBeUndefined();
  });
});
