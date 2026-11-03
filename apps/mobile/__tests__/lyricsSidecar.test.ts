import type { RemoteEntry } from "@/services/fileSource/types";
import {
  decodeLyricsText,
  indexLyricSidecars,
  parseLyricsSidecar,
  parseLyricsText,
  pickLyricsSidecar,
} from "@/services/local/lyricsSidecar";

const entry = (name: string, isDirectory = false): RemoteEntry => ({
  name,
  isDirectory,
  size: 10,
  mtime: 1,
  path: `smb:/music/${name}`,
});

const pick = (audio: string, names: string[]) =>
  pickLyricsSidecar(audio, indexLyricSidecars(names.map((n) => entry(n))))
    ?.name;

describe("pickLyricsSidecar", () => {
  it("ranks ttml over elrc over lrc over txt", () => {
    const names = ["Song.txt", "Song.lrc", "Song.elrc", "Song.ttml"];
    expect(pick("Song.flac", names)).toBe("Song.ttml");
    expect(pick("Song.flac", names.slice(0, 3))).toBe("Song.elrc");
    expect(pick("Song.flac", names.slice(0, 2))).toBe("Song.lrc");
    expect(pick("Song.flac", names.slice(0, 1))).toBe("Song.txt");
  });

  it("matches the full file name as well as the stem", () => {
    expect(pick("Song.mp3", ["Song.mp3.lrc"])).toBe("Song.mp3.lrc");
    expect(pick("Song.mp3", ["Song.mp3.lrc", "Song.lrc"])).toBe("Song.lrc");
  });

  it("matches case-insensitively", () => {
    expect(pick("01 Song.MP3", ["01 song.LRC"])).toBe("01 song.LRC");
  });

  it("ignores directories, other tracks' files and unrelated extensions", () => {
    const sidecars = indexLyricSidecars([
      entry("Song.lrc", true),
      entry("Other.lrc"),
      entry("Song.srt"),
      entry("lrc"),
    ]);
    expect(pickLyricsSidecar("Song.mp3", sidecars)).toBeUndefined();
  });
});

describe("decodeLyricsText", () => {
  it("strips a UTF-8 BOM", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("é"),
    ]);
    expect(decodeLyricsText(bytes)).toBe("é");
  });

  it("decodes UTF-16 by its BOM", () => {
    expect(
      decodeLyricsText(new Uint8Array([0xff, 0xfe, 0x48, 0, 0xe9, 0])),
    ).toBe("Hé");
    expect(
      decodeLyricsText(new Uint8Array([0xfe, 0xff, 0, 0x48, 0, 0xe9])),
    ).toBe("Hé");
  });
});

describe("parseLyricsText", () => {
  it("reads LRC written into a tag as synced, with word cues", () => {
    const lyrics = parseLyricsText(
      "[offset:+250]\n[00:01.00]Hi <00:01.50>there",
    );
    expect(lyrics).toMatchObject({
      lang: "und",
      synced: true,
      offset: 250,
      line: [{ value: "Hi there", start: 1000 }],
    });
    expect(lyrics?.cueLine?.[0]?.cue).toHaveLength(2);
  });

  it("keeps plain text unsynced, blank stanza lines included", () => {
    expect(parseLyricsText("one\n\ntwo")).toEqual({
      lang: "und",
      synced: false,
      line: [{ value: "one" }, { value: "" }, { value: "two" }],
    });
  });

  it("returns null for blank text", () => {
    expect(parseLyricsText(" \n ")).toBeNull();
  });
});

describe("parseLyricsSidecar", () => {
  it("parses by the sidecar's extension", () => {
    const ttml = parseLyricsSidecar(
      "smb:/music/Song.ttml",
      `<tt><body><p begin="1s">Hello</p></body></tt>`,
    );
    expect(ttml[0]).toMatchObject({ kind: "main", line: [{ value: "Hello" }] });
    const lrc = parseLyricsSidecar("smb:/music/Song.lrc", "[00:02.00]Hi");
    expect(lrc).toEqual([
      expect.objectContaining({
        synced: true,
        line: [{ value: "Hi", start: 2000 }],
      }),
    ]);
    expect(parseLyricsSidecar("smb:/music/Song.txt", "")).toEqual([]);
  });
});
