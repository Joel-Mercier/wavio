// `getAudioMetadata` over the native extractor. On Android the extractor hands
// back the tag region it read off its own descriptor, so enrichment must parse
// that instead of opening the file again from JS — the open that serialized
// every extraction of a scan on the JS thread (issue #211). Everywhere else
// (iOS, network shares) nothing comes back and the injected reader is used.

type NativeCall = [string, boolean, string | null, unknown, boolean];

const mockNative = {
  calls: [] as NativeCall[],
  result: {} as Record<string, unknown>,
};

jest.mock("expo", () => ({
  requireOptionalNativeModule: () => ({
    getAudioMetadata: (...args: NativeCall) => {
      mockNative.calls.push(args);
      return Promise.resolve({ ...mockNative.result });
    },
  }),
}));

jest.mock("expo-file-system", () => ({
  File: class {
    open() {
      throw new Error("the default device reader must not be reached");
    }
  },
  FileMode: { ReadOnly: "r" },
}));

import { getAudioMetadata } from "@/modules/audio-metadata";

const utf8 = (s: string): number[] => [...Buffer.from(s, "utf8")];

/** An ID3v2.4 file whose only frame is a TPE1 with two artists. */
const id3File = (): Uint8Array => {
  const text = [0x03, ...utf8("Artist A"), 0x00, ...utf8("Artist B")];
  const frame = [...utf8("TPE1"), 0, 0, 0, text.length, 0, 0, ...text];
  return Uint8Array.from([
    ...utf8("ID3"),
    0x04,
    0x00,
    0x00,
    0,
    0,
    0,
    frame.length,
    ...frame,
    ...new Array(512).fill(0xff),
  ]);
};

const countingOpener = (file: Uint8Array) => {
  const stats = { opened: 0, closed: 0 };
  const openReader = () => {
    stats.opened++;
    return Promise.resolve({
      read: (offset: number, length: number) =>
        Promise.resolve(file.subarray(offset, offset + length)),
      close: () => {
        stats.closed++;
      },
    });
  };
  return { openReader, stats };
};

beforeEach(() => {
  mockNative.calls = [];
  mockNative.result = { title: "Song" };
});

describe("getAudioMetadata", () => {
  it("asks the native side for the tag region exactly when enriching", async () => {
    await getAudioMetadata("content://doc/a.mp3", { enrich: true });
    await getAudioMetadata("content://doc/b.mp3");
    expect(mockNative.calls.map((call) => call[4])).toEqual([true, false]);
  });

  it("parses the native tag region without opening the file", async () => {
    const file = id3File();
    const tagEnd = 10 + (file.length - 10 - 512);
    mockNative.result = {
      title: "Song",
      tagHead: file.slice(0, tagEnd),
      tagHeadIsWholeFile: false,
    };
    const { openReader, stats } = countingOpener(file);

    const result = await getAudioMetadata("content://doc/a.mp3", {
      enrich: true,
      openReader,
    });

    expect(result).toEqual({
      title: "Song",
      artists: ["Artist A", "Artist B"],
    });
    expect(stats.opened).toBe(0);
  });

  it("never lets the transport fields reach the caller", async () => {
    mockNative.result = {
      title: "Song",
      tagHead: Uint8Array.from([0x52, 0x49, 0x46, 0x46]),
      tagHeadIsWholeFile: true,
    };

    for (const enrich of [true, false]) {
      const result = await getAudioMetadata("content://doc/a.wav", { enrich });
      expect(result).toEqual({ title: "Song" });
    }
  });

  it("reads through the injected reader when no region comes back", async () => {
    // iOS, or a network share read over HTTP.
    const file = id3File();
    const { openReader, stats } = countingOpener(file);

    const result = await getAudioMetadata("https://nas/a.mp3", {
      enrich: true,
      openReader,
    });

    expect(result.artists).toEqual(["Artist A", "Artist B"]);
    expect(stats).toEqual({ opened: 1, closed: 1 });
  });

  it("keeps the native fields when the reader can't be opened", async () => {
    const result = await getAudioMetadata("https://nas/gone.mp3", {
      enrich: true,
      openReader: () => Promise.reject(new Error("gone")),
    });
    expect(result).toEqual({ title: "Song" });
  });
});
