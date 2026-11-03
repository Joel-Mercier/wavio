import type {
  CueLine,
  Line,
  StructuredLyrics,
} from "@/services/openSubsonic/types";
import {
  buildFillWords,
  findCurrentLineIndex,
  hasLyricContent,
  isSyncedLyrics,
  parseLrcToStructuredLyrics,
  reconcileLyricsClock,
  stripLyricTimeTokens,
  wordFillProgress,
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

  // Missing starts coerce to 0, so untimed lines all compare equal and the
  // search resolves to a real index rather than -1. Callers must gate on
  // isSyncedLyrics instead of relying on this returning "no active line".
  it("cannot report the absence of an active line for untimed lines", () => {
    const lines: Line[] = [{ value: "a" }, { value: "b" }, { value: "c" }];
    expect(findCurrentLineIndex(lines, 30000)).not.toBe(-1);
  });
});

describe("isSyncedLyrics", () => {
  const build = (lyrics: Partial<StructuredLyrics>): StructuredLyrics => ({
    lang: "xxx",
    synced: false,
    line: [],
    ...lyrics,
  });

  it("is true when the layer is synced and carries timestamps", () => {
    expect(
      isSyncedLyrics(build({ synced: true, line: [{ value: "a", start: 0 }] })),
    ).toBe(true);
  });

  it("is false for an unsynced layer", () => {
    expect(
      isSyncedLyrics(build({ synced: false, line: [{ value: "a" }] })),
    ).toBe(false);
  });

  it("is false when a layer claims synced but carries no timestamps", () => {
    expect(
      isSyncedLyrics(
        build({ synced: true, line: [{ value: "a" }, { value: "b" }] }),
      ),
    ).toBe(false);
  });

  it("is true when only some lines carry timestamps", () => {
    expect(
      isSyncedLyrics(
        build({
          synced: true,
          line: [{ value: "a", start: 500 }, { value: "b" }],
        }),
      ),
    ).toBe(true);
  });

  it("is false for missing lyrics", () => {
    expect(isSyncedLyrics(null)).toBe(false);
    expect(isSyncedLyrics(undefined)).toBe(false);
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

// A server that answers getLyricsBySongId with an entry holding no text (an
// empty LYRICS tag, an empty .lrc sidecar) used to win useSyncedLyrics'
// `list[0]` fallback and read as "the server has lyrics" — blanking the view and
// skipping the LRCLIB fallback for a track LRCLIB actually has.
describe("hasLyricContent", () => {
  const entry = (line: Line[]): StructuredLyrics => ({
    lang: "xxx",
    synced: false,
    line,
  });

  it("rejects an entry with no lines", () => {
    expect(hasLyricContent(entry([]))).toBe(false);
  });

  it("rejects an entry whose lines are all blank", () => {
    expect(hasLyricContent(entry([{ value: "" }, { value: "   " }]))).toBe(
      false,
    );
  });

  it("accepts an entry with any real text", () => {
    expect(hasLyricContent(entry([{ value: "" }, { value: "words" }]))).toBe(
      true,
    );
  });

  it("rejects null / undefined", () => {
    expect(hasLyricContent(null)).toBe(false);
    expect(hasLyricContent(undefined)).toBe(false);
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

  it("parses A2 word stamps into a cue line", () => {
    const result = parseLrcToStructuredLyrics({
      syncedLyrics: [
        "[00:35.76]I <00:36.24>am <00:36.47>the <00:36.76>one",
        "[00:38.56]Who <00:38.70>will<00:39.00>",
      ].join("\n"),
    });
    expect(result?.line).toEqual([
      { value: "I am the one", start: 35760 },
      { value: "Who will", start: 38560 },
    ]);
    expect(result?.cueLine?.[0]).toMatchObject({
      index: 0,
      start: 35760,
      end: 38560,
      value: "I am the one",
    });
    expect(
      result?.cueLine?.[0]?.cue?.map(({ value, start, end }) => ({
        value,
        start,
        end,
      })),
    ).toEqual([
      { value: "I ", start: 35760, end: 36240 },
      { value: "am ", start: 36240, end: 36470 },
      { value: "the ", start: 36470, end: 36760 },
      { value: "one", start: 36760, end: undefined },
    ]);
    expect(result?.cueLine?.[1]?.cue?.map((c) => [c.value, c.end])).toEqual([
      ["Who ", 38700],
      ["will", 39000],
    ]);
  });

  it("indexes cue lines after sorting", () => {
    const result = parseLrcToStructuredLyrics({
      syncedLyrics: ["[00:05.00]b <00:05.50>c", "[00:01.00]a"].join("\n"),
    });
    expect(result?.line.map((l) => l.value)).toEqual(["a", "b c"]);
    expect(result?.cueLine?.map((c) => c.index)).toEqual([1]);
  });

  it("reads the [offset:] tag", () => {
    expect(
      parseLrcToStructuredLyrics({
        syncedLyrics: "[ti:Song]\n[offset:-300]\n[00:01.00]a",
      })?.offset,
    ).toBe(-300);
    expect(
      parseLrcToStructuredLyrics({ syncedLyrics: "[00:01.00]a" })?.offset,
    ).toBeUndefined();
  });

  it("emits no cue lines for plain line-synced LRC", () => {
    const result = parseLrcToStructuredLyrics({
      syncedLyrics: "[00:01.00]hello world",
    });
    expect(result?.cueLine).toBeUndefined();
  });

  it("skips word cues on a line sung at several timestamps", () => {
    const result = parseLrcToStructuredLyrics({
      syncedLyrics: "[00:01.00][00:09.00]la <00:01.50>la",
    });
    expect(result?.line).toHaveLength(2);
    expect(result?.cueLine).toBeUndefined();
  });
});

function cueLineOf(
  cues: { value: string; start: number; end?: number }[],
  end?: number,
): CueLine {
  return {
    index: 0,
    start: cues[0]?.start,
    end,
    value: cues.map((c) => c.value).join(""),
    cue: cues.map((c) => ({ ...c, byteStart: 0, byteEnd: 0 })),
  };
}

describe("buildFillWords", () => {
  it("uses each cue's own end and trims the text", () => {
    const words = buildFillWords(
      cueLineOf([
        { value: "She ", start: 1000, end: 1400 },
        { value: "was", start: 1400, end: 1700 },
      ]),
    );
    expect(words).toEqual([
      { text: "She", start: 1000, end: 1400 },
      { text: "was", start: 1400, end: 1700 },
    ]);
  });

  it("falls back to the next cue's start, then the line end", () => {
    const words = buildFillWords(
      cueLineOf(
        [
          { value: "a", start: 1000 },
          { value: "b", start: 1300 },
        ],
        2000,
      ),
    );
    expect(words.map((w) => w.end)).toEqual([1300, 2000]);
  });

  it("caps a last word that runs into a long pause", () => {
    const words = buildFillWords(
      cueLineOf([
        { value: "am", start: 0, end: 300 },
        { value: "the", start: 300, end: 600 },
        { value: "one", start: 600, end: 12_000 },
      ]),
    );
    expect(words[2].end).toBe(600 + 1500);
  });

  it("lets a slow line hold its last word longer", () => {
    const words = buildFillWords(
      cueLineOf([
        { value: "slow", start: 0, end: 1000 },
        { value: "song", start: 1000, end: 2000 },
        { value: "here", start: 2000, end: 10_000 },
      ]),
    );
    expect(words[2].end).toBe(2000 + 3000);
  });

  it("leaves a last word shorter than the cap alone", () => {
    const words = buildFillWords(
      cueLineOf([
        { value: "a", start: 0, end: 200 },
        { value: "b", start: 200, end: 1200 },
      ]),
    );
    expect(words[1].end).toBe(1200);
  });

  it("drops whitespace-only cues before capping the last word", () => {
    const words = buildFillWords(
      cueLineOf([
        { value: "a", start: 0, end: 200 },
        { value: "b", start: 200, end: 9000 },
        { value: " ", start: 9000, end: 9100 },
      ]),
    );
    expect(words.map((w) => w.text)).toEqual(["a", "b"]);
    expect(words[1].end).toBe(200 + 1500);
  });

  it("never yields a word ending before it starts", () => {
    const words = buildFillWords(
      cueLineOf([{ value: "x", start: 1000, end: 900 }]),
    );
    expect(words[0]).toMatchObject({ start: 1000, end: 1000 });
  });
});

describe("wordFillProgress", () => {
  it("is 0 before, linear during and 1 after the word", () => {
    expect(wordFillProgress(900, 1000, 2000)).toBe(0);
    expect(wordFillProgress(1500, 1000, 2000)).toBe(0.5);
    expect(wordFillProgress(2500, 1000, 2000)).toBe(1);
  });

  it("treats a zero-length word as instantly filled", () => {
    expect(wordFillProgress(999, 1000, 1000)).toBe(0);
    expect(wordFillProgress(1000, 1000, 1000)).toBe(1);
  });
});

describe("reconcileLyricsClock", () => {
  it("catches up to a report ahead of the clock", () => {
    expect(reconcileLyricsClock(1000, 1080)).toBe(1080);
  });

  it("keeps the clock when a report trails it slightly", () => {
    expect(reconcileLyricsClock(1000, 920)).toBe(1000);
  });

  it("jumps back on a backward seek", () => {
    expect(reconcileLyricsClock(60_000, 5000)).toBe(5000);
  });
});
