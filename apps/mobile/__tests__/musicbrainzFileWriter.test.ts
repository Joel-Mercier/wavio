// The native tagger is Android-only and can't load under Jest, so the module is
// mocked: what's under test here is the mapping from an override row to the
// payload the native side receives, plus the "never fail the correction"
// contract around a failed write.
const mockWriteTags = jest.fn();
const mockAvailable = jest.fn(() => true);

jest.mock("@/modules/audio-tagger", () => ({
  isAudioTaggerAvailable: () => mockAvailable(),
  writeTags: (uri: string, tags: object) => mockWriteTags(uri, tags),
}));

jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
}));

import {
  isFileWritingAvailable,
  toFileTagPayload,
  writeTagsToFile,
} from "@/services/musicbrainz/fileWriter";

const override = (overrides: Record<string, unknown> = {}) =>
  ({
    track_id: "local-track:1",
    title: "Mysterons",
    artist: "Portishead",
    album: "Dummy",
    album_artist: "Portishead",
    genre: null,
    year: 1994,
    track_number: 1,
    disc_number: 1,
    artists_json: null,
    music_brainz_id: "rec-1",
    artwork_path: null,
    album_key: "dummy portishead",
    artist_key: "portishead",
    mb_recording_id: "rec-1",
    mb_release_id: "rel-1",
    mb_release_group_id: "rg-1",
    mb_artist_id: "art-1",
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape
  }) as any;

beforeEach(() => {
  mockWriteTags.mockReset();
  mockAvailable.mockReset().mockReturnValue(true);
});

describe("toFileTagPayload", () => {
  it("maps the corrected fields onto the native payload", () => {
    expect(toFileTagPayload(override())).toEqual({
      title: "Mysterons",
      artist: "Portishead",
      album: "Dummy",
      albumArtist: "Portishead",
      year: 1994,
      trackNumber: 1,
      discNumber: 1,
      musicBrainzRecordingId: "rec-1",
      musicBrainzReleaseId: "rel-1",
    });
  });

  it("omits fields with no correction so they are left untouched in the file", () => {
    const payload = toFileTagPayload(
      override({ title: null, year: null, track_number: null }),
    );
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("year");
    expect(payload).not.toHaveProperty("trackNumber");
    expect(payload.album).toBe("Dummy");
  });

  it("passes cover art as a path, not as bytes across the bridge", () => {
    const payload = toFileTagPayload(override({ artwork_path: "/art/a.jpg" }));
    expect(payload.artworkPath).toBe("/art/a.jpg");
    expect(payload.artworkMimeType).toBe("image/jpeg");
  });

  it("omits artwork entirely when the album kept its own cover", () => {
    const payload = toFileTagPayload(override({ artwork_path: null }));
    expect(payload).not.toHaveProperty("artworkPath");
    expect(payload).not.toHaveProperty("artworkMimeType");
  });

  it("keeps a zero disc or track number rather than dropping it", () => {
    const payload = toFileTagPayload(
      override({ track_number: 0, disc_number: 0 }),
    );
    expect(payload.trackNumber).toBe(0);
    expect(payload.discNumber).toBe(0);
  });
});

describe("writeTagsToFile", () => {
  it("reports success when the native write succeeds", async () => {
    mockWriteTags.mockResolvedValue(undefined);
    await expect(
      writeTagsToFile("content://x/1.mp3", override()),
    ).resolves.toBe(true);
    expect(mockWriteTags).toHaveBeenCalledWith(
      "content://x/1.mp3",
      expect.objectContaining({ title: "Mysterons" }),
    );
  });

  it("degrades to false instead of throwing when the file can't be tagged", async () => {
    // A read-only volume or an unsupported container must not lose the
    // correction — the caller still persists the in-app override.
    mockWriteTags.mockRejectedValue(new Error("Unsupported audio file"));
    await expect(
      writeTagsToFile("content://x/1.wma", override()),
    ).resolves.toBe(false);
  });

  it("does not attempt a write when the tagger is unavailable", async () => {
    mockAvailable.mockReturnValue(false);
    await expect(
      writeTagsToFile("content://x/1.mp3", override()),
    ).resolves.toBe(false);
    expect(mockWriteTags).not.toHaveBeenCalled();
  });
});

describe("isFileWritingAvailable", () => {
  it("follows what the native module reports", () => {
    mockAvailable.mockReturnValue(true);
    expect(isFileWritingAvailable()).toBe(true);
    mockAvailable.mockReturnValue(false);
    expect(isFileWritingAvailable()).toBe(false);
  });
});
