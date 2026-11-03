// Which lyrics a local track resolves to: the sidecar first (read at request
// time), embedded tags behind it, and a `.txt` sidecar losing to synced tags.

const mockQueryTrackLyrics = jest.fn();
jest.mock("@/services/local/repository", () => ({
  queryTrackLyrics: (id: string) => mockQueryTrackLyrics(id),
}));

const mockFiles = new Map<string, string>();
const mockOpened: string[] = [];
jest.mock("@/services/fileSource", () => ({
  activeFileSource: () => ({
    openReader(path: string) {
      mockOpened.push(path);
      const text = mockFiles.get(path);
      if (text == null) return Promise.reject(new Error("unreachable"));
      return Promise.resolve({
        read: () => Promise.resolve(new TextEncoder().encode(text)),
        close() {},
      });
    },
  }),
}));

jest.mock("@/utils/log", () => ({ logError: jest.fn() }));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ serverVersion: "" }) },
}));

jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

import { getLyricsBySongId } from "@/services/local/mediaRetrieval";

const row = (lyrics: string | null, lyrics_sidecar: string | null) =>
  mockQueryTrackLyrics.mockResolvedValue({
    title: "Song",
    artist: "Artist",
    lyrics,
    lyrics_sidecar,
  });

const resolve = async () =>
  (await getLyricsBySongId("t1")).lyricsList.structuredLyrics;

beforeEach(() => {
  mockFiles.clear();
  mockOpened.length = 0;
});

describe("local getLyricsBySongId", () => {
  it("prefers the sidecar over embedded lyrics", async () => {
    row("[00:01.00]embedded", "smb:/Song.lrc");
    mockFiles.set("smb:/Song.lrc", "[00:02.00]sidecar <00:02.50>words");

    const [lyrics] = await resolve();

    expect(lyrics.line).toEqual([{ value: "sidecar words", start: 2000 }]);
    expect(lyrics.cueLine).toHaveLength(1);
    expect(lyrics.displayTitle).toBe("Song");
  });

  it("returns every TTML layer", async () => {
    row(null, "smb:/Song.ttml");
    mockFiles.set(
      "smb:/Song.ttml",
      `<tt><body><p begin="1s">Hi<span ttm:role="x-translation" xml:lang="fr">Salut</span></p></body></tt>`,
    );

    expect((await resolve()).map((l) => l.kind)).toEqual([
      "main",
      "translation",
    ]);
  });

  it("reads synced lyrics out of an embedded tag", async () => {
    row("[00:03.00]tagged", null);

    expect(await resolve()).toEqual([
      expect.objectContaining({
        synced: true,
        line: [{ value: "tagged", start: 3000 }],
      }),
    ]);
    expect(mockOpened).toEqual([]);
  });

  it("lets synced embedded lyrics beat a .txt sidecar without reading it", async () => {
    row("[00:03.00]tagged", "smb:/Song.txt");

    expect((await resolve())[0].line[0].value).toBe("tagged");
    expect(mockOpened).toEqual([]);
  });

  it("still reads a .txt sidecar over plain embedded lyrics", async () => {
    row("plain tag", "smb:/Song.txt");
    mockFiles.set("smb:/Song.txt", "from file");

    expect((await resolve())[0].line).toEqual([{ value: "from file" }]);
  });

  it("falls back to embedded lyrics when the sidecar can't be read", async () => {
    row("plain tag", "smb:/Song.lrc");

    expect((await resolve())[0].line).toEqual([{ value: "plain tag" }]);
  });

  it("throws when the sidecar can't be read and nothing is embedded", async () => {
    row(null, "smb:/Song.lrc");

    await expect(getLyricsBySongId("t1")).rejects.toThrow("unreachable");
  });

  it("falls back to embedded lyrics when the sidecar is empty", async () => {
    row("plain tag", "smb:/Song.lrc");
    mockFiles.set("smb:/Song.lrc", "   ");

    expect((await resolve())[0].line).toEqual([{ value: "plain tag" }]);
  });

  it("resolves to no lyrics for a track with neither", async () => {
    row(null, null);

    expect(await resolve()).toEqual([]);
  });
});
