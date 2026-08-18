// Unit tests for `modules/audio-metadata/rawTags`. They operate on hand-built
// byte buffers, so they exercise the ID3v2 / Vorbis frame decoding without any
// device access. The module takes its I/O as a `ByteReader` and imports nothing,
// so `readRawTags` itself is exercised here too — against a fake reader that
// records which ranges were requested.
import {
  type ByteReader,
  parseId3Frames,
  parseVorbisComments,
  readRawTags,
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

  it("reads multi-value release types from a MusicBrainz Album Type TXXX", () => {
    const body = buildId3Body([
      id3Frame(
        "TXXX",
        [
          0x03,
          ...utf8("MusicBrainz Album Type"),
          NUL,
          ...utf8("album"),
          NUL,
          ...utf8("live"),
        ],
        4,
      ),
    ]);
    expect(parseId3Frames(body, 4).releaseTypes).toEqual(["album", "live"]);
  });

  it("recovers a year from a TDRC timestamp frame", () => {
    const body = buildId3Body([
      id3Frame("TDRC", [0x03, ...utf8("2021-05-01T12:00:00")], 4),
    ]);
    expect(parseId3Frames(body, 4).year).toBe(2021);
  });

  it("recovers a year from a legacy TYER frame", () => {
    const body = buildId3Body([id3Frame("TYER", [0x00, ...utf8("1998")], 3)]);
    expect(parseId3Frames(body, 3).year).toBe(1998);
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
    const bytes = buildVorbis("v", ["TITLE=x", "ALBUM=y"]);
    expect(parseVorbisComments(bytes)).toEqual({});
  });

  it("collects multi-value RELEASETYPE comments", () => {
    const bytes = buildVorbis("v", ["RELEASETYPE=album", "RELEASETYPE=live"]);
    expect(parseVorbisComments(bytes).releaseTypes).toEqual(["album", "live"]);
  });

  it("recovers the year from a DATE comment, ignoring the day/month", () => {
    const bytes = buildVorbis("v", ["DATE=2019-03-08"]);
    expect(parseVorbisComments(bytes).year).toBe(2019);
  });
});

// ---------------------------------------------------------------------------
// readRawTags — container detection and the read ranges it asks for
// ---------------------------------------------------------------------------

/** A reader over a fixed buffer that records every requested range. */
const fakeReader = (bytes: Uint8Array) => {
  const ranges: [number, number][] = [];
  const reader: ByteReader = {
    read(offset, length) {
      ranges.push([offset, length]);
      return Promise.resolve(bytes.subarray(offset, offset + length));
    },
  };
  return { reader, ranges };
};

/** A complete ID3v2.4-tagged file: header, tag body, then fake audio. */
const buildId3File = (frames: number[][], audioBytes = 4096): Uint8Array => {
  const body = frames.flat();
  return Uint8Array.from([
    ...utf8("ID3"),
    0x04,
    0x00, // v2.4.0
    0x00, // no flags
    ...synchsafe(body.length),
    ...body,
    ...new Array(audioBytes).fill(0xff),
  ]);
};

/** A FLAC file: "fLaC", a padding block, the comment block, then fake audio. */
const buildFlacFile = (comment: Uint8Array, audioBytes = 4096): Uint8Array => {
  const padding = new Array(16).fill(0x00);
  return Uint8Array.from([
    ...utf8("fLaC"),
    0x01, // PADDING (type 1), not last
    (padding.length >> 16) & 0xff,
    (padding.length >> 8) & 0xff,
    padding.length & 0xff,
    ...padding,
    0x84, // VORBIS_COMMENT (type 4), last block
    (comment.length >> 16) & 0xff,
    (comment.length >> 8) & 0xff,
    comment.length & 0xff,
    ...comment,
    ...new Array(audioBytes).fill(0xff),
  ]);
};

describe("readRawTags", () => {
  it("reads an ID3v2 tag in two ranges and never touches the audio", async () => {
    const frames = [
      id3Frame(
        "TPE1",
        [0x03, ...utf8("Artist A"), NUL, ...utf8("Artist B")],
        4,
      ),
    ];
    const file = buildId3File(frames);
    const { reader, ranges } = fakeReader(file);

    const result = await readRawTags(reader);

    expect(result.artists).toEqual(["Artist A", "Artist B"]);
    // One 10-byte read covers signature + header, then exactly the declared tag
    // region. Two round trips is what makes this affordable over a network share.
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual([0, 10]);
    expect(ranges[1][0]).toBe(10);
    // The audio payload starts after the tag; nothing may read into it.
    const tagEnd = 10 + ranges[1][1];
    expect(tagEnd).toBeLessThan(file.length);
  });

  it("walks FLAC metadata blocks and reads only the comment block", async () => {
    const comment = buildVorbis("ref", [
      "ARTIST=A",
      "REPLAYGAIN_TRACK_GAIN=-6.6 dB",
    ]);
    const file = buildFlacFile(comment);
    const { reader, ranges } = fakeReader(file);

    const result = await readRawTags(reader);

    expect(result.artists).toEqual(["A"]);
    expect(result.replayGain?.trackGain).toBeCloseTo(-6.6);
    // Signature+header, the padding block header, the comment block header,
    // then the comment body — the block walk, and nothing else.
    expect(ranges.map(([, length]) => length)).toEqual([
      10,
      4,
      4,
      comment.length,
    ]);
  });

  it("returns an empty object for an unrecognised container", async () => {
    const { reader } = fakeReader(Uint8Array.from(utf8("RIFFxxxxWAVE")));
    expect(await readRawTags(reader)).toEqual({});
  });

  it("returns an empty object for a file shorter than a header", async () => {
    const { reader } = fakeReader(Uint8Array.from([0x49, 0x44]));
    expect(await readRawTags(reader)).toEqual({});
  });

  it("refuses a declared tag size beyond the sanity cap", async () => {
    // 8 MB declared, over the 4 MB MAX_TAG_BYTES valve.
    const header = Uint8Array.from([
      ...utf8("ID3"),
      0x04,
      0x00,
      0x00,
      ...synchsafe(8 * 1024 * 1024),
    ]);
    const { reader, ranges } = fakeReader(header);
    expect(await readRawTags(reader)).toEqual({});
    // Bailed on the header alone — never asked for the bogus region.
    expect(ranges).toHaveLength(1);
  });

  it("swallows a reader failure rather than breaking extraction", async () => {
    const reader: ByteReader = {
      read: () => Promise.reject(new Error("connection reset")),
    };
    expect(await readRawTags(reader)).toEqual({});
  });
});
