// Unit tests for the pure raw-frame parsers in `modules/audio-metadata/rawTags`.
// They operate on hand-built byte buffers, so they exercise the ID3v2 / Vorbis
// frame decoding without any device or `expo-file-system` access. The module
// imports `expo-file-system` at the top for `readRawTags`, which these tests
// don't touch — mock it so the import resolves under jest.
jest.mock("expo-file-system", () => ({
  File: class {},
  FileMode: { ReadOnly: "r" },
}));

import {
  parseId3Frames,
  parseVorbisComments,
} from "@/modules/audio-metadata/rawTags";

const utf8 = (s: string): number[] => [...Buffer.from(s, "utf8")];

/** Encode an integer as a 4-byte synchsafe value (7 bits per byte, ID3v2.4). */
const synchsafe = (n: number): number[] => [
  (n >> 21) & 0x7f,
  (n >> 14) & 0x7f,
  (n >> 7) & 0x7f,
  n & 0x7f,
];

/** Encode an integer as a plain big-endian 4-byte value (ID3v2.3). */
const uint32be = (n: number): number[] => [
  (n >> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];

/** Encode an integer as a little-endian 4-byte value (Vorbis comments). */
const uint32le = (n: number): number[] => [
  n & 0xff,
  (n >> 8) & 0xff,
  (n >> 16) & 0xff,
  (n >> 24) & 0xff,
];

/** Build one ID3v2.3/2.4 frame: 4-char id, size, 2 flag bytes, then body. */
const id3Frame = (id: string, body: number[], major: number): number[] => {
  const size = major >= 4 ? synchsafe(body.length) : uint32be(body.length);
  return [...utf8(id), ...size, 0x00, 0x00, ...body];
};

const NUL = 0x00;

const buildId3Body = (frames: number[][]): Uint8Array =>
  Uint8Array.from(frames.flat());

/** Build a full Vorbis comment block body (vendor + count + KEY=value list). */
const buildVorbis = (vendor: string, comments: string[]): Uint8Array => {
  const out: number[] = [];
  out.push(...uint32le(vendor.length), ...utf8(vendor));
  out.push(...uint32le(comments.length));
  for (const c of comments) {
    const bytes = utf8(c);
    out.push(...uint32le(bytes.length), ...bytes);
  }
  return Uint8Array.from(out);
};

describe("parseId3Frames", () => {
  const txxx = (desc: string, value: string): number[] => [
    0x03, // UTF-8
    ...utf8(desc),
    NUL,
    ...utf8(value),
  ];

  it("parses ReplayGain from TXXX frames", () => {
    const body = buildId3Body([
      id3Frame("TXXX", txxx("REPLAYGAIN_TRACK_GAIN", "-7.59 dB"), 4),
      id3Frame("TXXX", txxx("REPLAYGAIN_ALBUM_GAIN", "-6.30 dB"), 4),
      id3Frame("TXXX", txxx("REPLAYGAIN_TRACK_PEAK", "0.988556"), 4),
      id3Frame("TXXX", txxx("REPLAYGAIN_ALBUM_PEAK", "0.999969"), 4),
    ]);
    expect(parseId3Frames(body, 4)).toEqual({
      replayGain: {
        trackGain: -7.59,
        albumGain: -6.3,
        trackPeak: 0.988556,
        albumPeak: 0.999969,
      },
    });
  });

  it("splits multi-value TPE1 on the NUL separator (v2.4)", () => {
    const body = buildId3Body([
      id3Frame(
        "TPE1",
        [0x03, ...utf8("Artist A"), NUL, ...utf8("Artist B")],
        4,
      ),
    ]);
    expect(parseId3Frames(body, 4).artists).toEqual(["Artist A", "Artist B"]);
  });

  it("splits TPE1 on '/' when there is only a trailing NUL (v2.3)", () => {
    const body = buildId3Body([
      id3Frame("TPE1", [0x00, ...utf8("Artist A / Artist B"), NUL], 3),
    ]);
    expect(parseId3Frames(body, 3).artists).toEqual(["Artist A", "Artist B"]);
  });

  it("keeps a single artist name containing a slash-free string intact", () => {
    const body = buildId3Body([
      id3Frame("TPE1", [0x00, ...utf8("AC DC"), NUL], 3),
    ]);
    expect(parseId3Frames(body, 3).artists).toEqual(["AC DC"]);
  });

  it("extracts lyrics text from a USLT frame, dropping the descriptor", () => {
    const uslt = [
      0x03, // UTF-8
      ...utf8("eng"), // language
      ...utf8("desc"),
      NUL,
      ...utf8("line one\nline two"),
    ];
    const body = buildId3Body([id3Frame("USLT", uslt, 4)]);
    expect(parseId3Frames(body, 4).lyrics).toBe("line one\nline two");
  });

  it("reads a MusicBrainz id from a UFID frame", () => {
    const ufid = [
      ...utf8("http://musicbrainz.org"),
      NUL,
      ...utf8("d6f7e0a1-1234-5678-9abc-def012345678"),
    ];
    const body = buildId3Body([id3Frame("UFID", ufid, 4)]);
    expect(parseId3Frames(body, 4).musicBrainzId).toBe(
      "d6f7e0a1-1234-5678-9abc-def012345678",
    );
  });

  it("ignores a UFID frame from a non-MusicBrainz owner", () => {
    const ufid = [...utf8("other-owner"), NUL, ...utf8("whatever")];
    const body = buildId3Body([id3Frame("UFID", ufid, 4)]);
    expect(parseId3Frames(body, 4).musicBrainzId).toBeUndefined();
  });

  it("falls back to a TXXX MusicBrainz track id", () => {
    const body = buildId3Body([
      id3Frame("TXXX", txxx("MUSICBRAINZ_TRACK_ID", "abc-123"), 4),
    ]);
    expect(parseId3Frames(body, 4).musicBrainzId).toBe("abc-123");
  });

  it("stops cleanly at padding (zero bytes) after the last frame", () => {
    const body = buildId3Body([
      id3Frame("TPE1", [0x03, ...utf8("Solo")], 4),
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // padding
    ]);
    expect(parseId3Frames(body, 4).artists).toEqual(["Solo"]);
  });

  it("returns an empty object for a body with no recognised frames", () => {
    const body = buildId3Body([
      id3Frame("TIT2", [0x03, ...utf8("Some Title")], 4),
    ]);
    expect(parseId3Frames(body, 4)).toEqual({});
  });
});

describe("parseVorbisComments", () => {
  it("parses ReplayGain, multi-artist, lyrics and MusicBrainz id", () => {
    const bytes = buildVorbis("reference libFLAC", [
      "REPLAYGAIN_TRACK_GAIN=-3.21 dB",
      "REPLAYGAIN_ALBUM_GAIN=-2.10 dB",
      "REPLAYGAIN_TRACK_PEAK=0.812345",
      "REPLAYGAIN_ALBUM_PEAK=0.987654",
      "ARTIST=Artist A",
      "ARTIST=Artist B",
      "LYRICS=hello world",
      "MUSICBRAINZ_TRACKID=mb-xyz-789",
    ]);
    expect(parseVorbisComments(bytes)).toEqual({
      replayGain: {
        trackGain: -3.21,
        albumGain: -2.1,
        trackPeak: 0.812345,
        albumPeak: 0.987654,
      },
      artists: ["Artist A", "Artist B"],
      lyrics: "hello world",
      musicBrainzId: "mb-xyz-789",
    });
  });

  it("splits a single ARTIST tag on '/' and ';' delimiters", () => {
    const bytes = buildVorbis("v", ["ARTIST=Artist A / Artist B; Artist C"]);
    expect(parseVorbisComments(bytes).artists).toEqual([
      "Artist A",
      "Artist B",
      "Artist C",
    ]);
  });

  it("is case-insensitive on keys and ignores unrelated comments", () => {
    const bytes = buildVorbis("v", [
      "title=Whatever",
      "replaygain_track_gain=+1.50 dB",
    ]);
    expect(parseVorbisComments(bytes)).toEqual({
      replayGain: { trackGain: 1.5 },
    });
  });

  it("returns an empty object when there are no relevant comments", () => {
    const bytes = buildVorbis("v", ["TITLE=x", "ALBUM=y", "DATE=2020"]);
    expect(parseVorbisComments(bytes)).toEqual({});
  });
});
