import type { Line } from "@/services/openSubsonic/types";
import {
  findCurrentLineIndex,
  parseLrcToStructuredLyrics,
  stripLyricTimeTokens,
} from "@/utils/lyrics";

describe("findCurrentLineIndex", () => {
  it("returns -1 before the first timestamp", () => {
    const lines: Line[] = [
      { value: "a", start: 1000 },
      { value: "b", start: 2000 },
    ];
    expect(findCurrentLineIndex(lines, 500)).toBe(-1);
  });

  it("returns the last line whose start is at or before the position", () => {
    const lines: Line[] = [
      { value: "a", start: 1000 },
      { value: "b", start: 2000 },
      { value: "c", start: 3000 },
    ];
    expect(findCurrentLineIndex(lines, 2500)).toBe(1);
    expect(findCurrentLineIndex(lines, 3000)).toBe(2);
  });

  it("highlights the first line of an equal-timestamp group (original language)", () => {
    const lines: Line[] = [
      { value: "original", start: 12000 },
      { value: "romanization", start: 12000 },
      { value: "translation", start: 12000 },
      { value: "next", start: 20000 },
    ];
    expect(findCurrentLineIndex(lines, 15000)).toBe(0);
    expect(findCurrentLineIndex(lines, 20000)).toBe(3);
  });

  it("returns -1 for an empty list", () => {
    expect(findCurrentLineIndex([], 1000)).toBe(-1);
  });
});

describe("stripLyricTimeTokens", () => {
  it("removes a bracketed stamp in leading, trailing and mid-line positions", () => {
    expect(stripLyricTimeTokens("[00:12.34]hello")).toBe("hello");
    expect(stripLyricTimeTokens("hello[00:12.34]")).toBe("hello");
    expect(stripLyricTimeTokens("hello [00:12.34] world")).toBe("hello world");
  });

  it("removes A2 word-level angle-bracket stamps", () => {
    expect(stripLyricTimeTokens("<00:12.34>hello <00:13.00>world")).toBe(
      "hello world",
    );
  });

  it("leaves ordinary text (including a colon) intact", () => {
    expect(stripLyricTimeTokens("meet me at 3:30 tonight")).toBe(
      "meet me at 3:30 tonight",
    );
  });
});

describe("parseLrcToStructuredLyrics", () => {
  it("keeps text for trailing-timestamp lines instead of emptying them", () => {
    const record = {
      syncedLyrics: "覚めないように目蓋閉じれば[00:17.75]",
    };
    const result = parseLrcToStructuredLyrics(record);
    expect(result?.synced).toBe(true);
    expect(result?.line).toEqual([
      { value: "覚めないように目蓋閉じれば", start: 17750 },
    ]);
  });

  it("keeps same-timestamp lines in original order", () => {
    const record = {
      syncedLyrics: [
        "[00:17.75]覚めないように目蓋閉じれば",
        "[00:17.75]sa me na i yo u ni ma bu ta to ji re ba",
        "[00:17.75]仿佛未醒来般闭上眼帘",
      ].join("\n"),
    };
    const result = parseLrcToStructuredLyrics(record);
    expect(result?.line.map((l) => l.value)).toEqual([
      "覚めないように目蓋閉じれば",
      "sa me na i yo u ni ma bu ta to ji re ba",
      "仿佛未醒来般闭上眼帘",
    ]);
    expect(result?.line.every((l) => l.start === 17750)).toBe(true);
  });

  it("strips time tokens from plain (unsynced) lyrics", () => {
    const record = {
      plainLyrics: "line one[00:01.00]\n\nline two",
    };
    const result = parseLrcToStructuredLyrics(record);
    expect(result?.synced).toBe(false);
    expect(result?.line).toEqual([
      { value: "line one" },
      { value: "line two" },
    ]);
  });
});
