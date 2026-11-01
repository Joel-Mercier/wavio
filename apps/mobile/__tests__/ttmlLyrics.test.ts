import { parseTtmlLyrics, parseTtmlTime } from "@/utils/ttmlLyrics";

// Trimmed from the Apple-style sample Navidrome reads; the expectations mirror
// what Navidrome's getLyricsBySongId returns for the same file.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:itunes="http://music.apple.com/lyric-ttml-internal"
    xml:lang="en">
  <head>
    <metadata>
      <ttm:agent type="person" xml:id="v1"><ttm:name type="full">Michael</ttm:name></ttm:agent>
      <ttm:agent type="person" xml:id="v2"><ttm:name type="full">Guest</ttm:name></ttm:agent>
      <ttm:agent type="group" xml:id="v3"><ttm:name type="full">Everyone</ttm:name></ttm:agent>
      <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">
        <translations>
          <translation xml:lang="fr">
            <text for="L1">Rouler vers la lueur du couchant</text>
            <text for="L2">Les néons m'appellent à la maison</text>
          </translation>
        </translations>
        <transliterations>
          <transliteration xml:lang="en-Latn">
            <text for="L2">NEE-on lyts</text>
          </transliteration>
        </transliterations>
      </iTunesMetadata>
    </metadata>
  </head>
  <body>
    <div>
      <p begin="00:00.000" end="00:04.000" ttm:agent="v1" itunes:key="L1"><span begin="00:00.000" end="00:00.800">Driving </span><span begin="00:00.800" end="00:01.400">into </span><span begin="00:01.400" end="00:04.000">glow</span></p>
      <p begin="00:04.000" end="00:08.000" ttm:agent="v2" itunes:key="L2"><span begin="00:04.000" end="00:04.700">Neon </span><span begin="00:04.700" end="00:08.000">lights</span></p>
      <p begin="00:12.000" end="00:16.000" ttm:agent="v3" itunes:key="L4"><span begin="00:12.000" end="00:16.000">Everybody</span></p>
      <p begin="00:20.000" end="00:24.000" ttm:agent="v1" ttm:role="x-bg" itunes:key="L6"><span begin="00:20.000" end="00:21.300">(ooh </span><span begin="00:21.300" end="00:24.000">ooh)</span></p>
    </div>
  </body>
</tt>`;

describe("parseTtmlTime", () => {
  it.each([
    ["00:04.000", 4000],
    ["01:02:03.5", 3_723_500],
    ["12.5s", 12_500],
    ["500ms", 500],
    ["1.5m", 90_000],
    ["7", 7000],
  ])("parses %s", (value, ms) => {
    expect(parseTtmlTime(value)).toBe(ms);
  });

  it.each(["", "abc", "00:01:02:03", "-1s"])("rejects %p", (value) => {
    expect(parseTtmlTime(value)).toBeUndefined();
  });
});

describe("parseTtmlLyrics", () => {
  const [main, translation, pronunciation] = parseTtmlLyrics(
    SAMPLE,
    "Sunset Driver",
    "Michael Jackson",
  );

  it("maps lines and word cues", () => {
    expect(main).toMatchObject({
      kind: "main",
      lang: "en",
      synced: true,
      displayTitle: "Sunset Driver",
      displayArtist: "Michael Jackson",
    });
    expect(main.line).toEqual([
      { value: "Driving into glow", start: 0 },
      { value: "Neon lights", start: 4000 },
      { value: "Everybody", start: 12_000 },
      { value: "(ooh ooh)", start: 20_000 },
    ]);
    expect(main.cueLine?.[0]).toEqual({
      index: 0,
      start: 0,
      end: 4000,
      value: "Driving into glow",
      agentId: "v1",
      cue: [
        { start: 0, end: 800, byteStart: 0, byteEnd: 8, value: "Driving " },
        { start: 800, end: 1400, byteStart: 8, byteEnd: 13, value: "into " },
        { start: 1400, end: 4000, byteStart: 13, byteEnd: 17, value: "glow" },
      ],
    });
  });

  it("maps agents the way Navidrome does, with a background agent", () => {
    expect(main.agents).toEqual([
      { id: "v1", role: "main", name: "Michael" },
      { id: "v2", role: "voice", name: "Guest" },
      { id: "v3", role: "group", name: "Everyone" },
      { id: "bg:v1", role: "bg", name: "Michael" },
    ]);
    expect(main.cueLine?.map((c) => c.agentId)).toEqual([
      "v1",
      "v2",
      "v3",
      "bg:v1",
    ]);
  });

  it("keys head translations and transliterations onto line starts", () => {
    expect(translation).toEqual({
      kind: "translation",
      lang: "fr",
      synced: true,
      line: [
        { value: "Rouler vers la lueur du couchant", start: 0 },
        { value: "Les néons m'appellent à la maison", start: 4000 },
      ],
    });
    expect(pronunciation).toEqual({
      kind: "pronunciation",
      lang: "en-Latn",
      synced: true,
      line: [{ value: "NEE-on lyts", start: 4000 }],
    });
  });

  it("splits nested background vocals into their own line", () => {
    const [lyrics] =
      parseTtmlLyrics(`<tt><body><p begin="1s" end="5s" ttm:agent="v1">
      <span begin="1s" end="2s">Hello</span> <span begin="2s" end="3s">world</span>
      <span ttm:role="x-bg"><span begin="3.5s" end="4s">(yeah)</span></span>
    </p></body></tt>`);
    expect(lyrics.line).toEqual([
      { value: "Hello world", start: 1000 },
      { value: "(yeah)", start: 3500 },
    ]);
    expect(lyrics.cueLine?.[1]).toMatchObject({
      index: 1,
      agentId: "bg:v1",
      end: 4000,
    });
    expect(lyrics.agents).toEqual([{ id: "bg:v1", role: "bg" }]);
  });

  it("merges syllable spans that have no space between them", () => {
    const [lyrics] = parseTtmlLyrics(`<tt><body><p begin="0s">
      <span begin="0s" end="0.2s">beau</span><span begin="0.2s" end="0.4s">ti</span><span begin="0.4s" end="0.8s">ful</span> <span begin="1s" end="1.5s">day</span>
    </p></body></tt>`);
    expect(
      lyrics.cueLine?.[0]?.cue?.map(({ value, start, end }) => [
        value,
        start,
        end,
      ]),
    ).toEqual([
      ["beautiful ", 0, 800],
      ["day", 1000, 1500],
    ]);
  });

  it("collects inline translation and romanisation spans", () => {
    const [, translation, pronunciation] =
      parseTtmlLyrics(`<tt><body><p begin="2s">
      <span begin="2s" end="3s">こんにちは</span>
      <span ttm:role="x-translation" xml:lang="en">Hello</span>
      <span ttm:role="x-roman">konnichiwa</span>
    </p></body></tt>`);
    expect(translation).toMatchObject({
      kind: "translation",
      lang: "en",
      line: [{ value: "Hello", start: 2000 }],
    });
    expect(pronunciation).toMatchObject({
      kind: "pronunciation",
      lang: "und",
      line: [{ value: "konnichiwa", start: 2000 }],
    });
  });

  it("keeps line-only timing without word cues", () => {
    const [lyrics] = parseTtmlLyrics(
      `<tt><body><p begin="1s">First &amp; line</p><p begin="4s">Second</p></body></tt>`,
    );
    expect(lyrics.line).toEqual([
      { value: "First & line", start: 1000 },
      { value: "Second", start: 4000 },
    ]);
    expect(lyrics.cueLine).toBeUndefined();
  });

  it("returns nothing for a document without lyric lines", () => {
    expect(parseTtmlLyrics("<tt><body></body></tt>")).toEqual([]);
    expect(parseTtmlLyrics("not xml at all")).toEqual([]);
  });
});
