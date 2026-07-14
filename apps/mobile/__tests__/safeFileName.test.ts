import { safeFileName } from "@/utils/safeFileName";

describe("safeFileName", () => {
  it("keeps a plain title and appends the suffix", () => {
    expect(safeFileName("Blue Monday", "flac", "id1")).toBe("Blue Monday.flac");
  });

  it("defaults the extension to mp3 when the suffix is missing", () => {
    expect(safeFileName("Song", undefined, "id1")).toBe("Song.mp3");
  });

  it("falls back to the id when the title is missing or empty", () => {
    expect(safeFileName(undefined, "mp3", "id1")).toBe("id1.mp3");
    expect(safeFileName("   ", "mp3", "id1")).toBe("id1.mp3");
  });

  it("strips filesystem-illegal characters", () => {
    expect(safeFileName('a/b\\c?d%e*f:g|h"i<j>k', "mp3", "id")).toBe(
      "abcdefghijk.mp3",
    );
  });

  it("strips URI-illegal characters that java.net.URI rejects (WAVIO-F3)", () => {
    // `[` / `]` are common in track titles ("Song [Live]") and are legal on the
    // filesystem but illegal in a file:// URI, which crashed downloadFileAsync.
    expect(safeFileName("Song [Live] {Remix} #1 ^`", "m4a", "id")).toBe(
      "Song Live Remix 1.m4a",
    );
  });

  it("strips control characters", () => {
    const title = `a${String.fromCharCode(1)}b${String.fromCharCode(31)}c`;
    expect(safeFileName(title, "mp3", "id")).toBe("abc.mp3");
  });

  it("collapses whitespace runs to a single space", () => {
    expect(safeFileName("a\t\n  b", "mp3", "id")).toBe("a b.mp3");
  });

  it("caps very long titles", () => {
    const long = "x".repeat(500);
    const out = safeFileName(long, "mp3", "id");
    expect(out.length).toBeLessThanOrEqual(104); // 100 + ".mp3"
  });
});
