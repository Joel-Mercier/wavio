import type { AudioMetadata } from "@/modules/audio-metadata";
import { deriveTrackTags, parseFileName } from "@/services/local/deriveTags";

const NONE = {} as AudioMetadata;

describe("parseFileName", () => {
  it("splits Artist - Title", () => {
    expect(parseFileName("Earth, Wind & Fire - Lets Groove.mp3")).toEqual({
      artist: "Earth, Wind & Fire",
      album: undefined,
      title: "Lets Groove",
      trackNumber: undefined,
    });
  });

  it("treats a leading number as a track number, not an artist", () => {
    expect(parseFileName("03 - Another Brick.mp3")).toEqual({
      title: "Another Brick",
      trackNumber: 3,
    });
    expect(parseFileName("03. Another Brick.flac")).toEqual({
      title: "Another Brick",
      trackNumber: 3,
    });
    expect(parseFileName("07 Time.mp3")).toEqual({
      title: "Time",
      trackNumber: 7,
    });
  });

  it("parses Artist - Album - NN - Title", () => {
    expect(
      parseFileName("Pink Floyd - The Wall - 03 - Another Brick.mp3"),
    ).toEqual({
      artist: "Pink Floyd",
      album: "The Wall",
      title: "Another Brick",
      trackNumber: 3,
    });
  });

  it("does not mistake a numeric-leading artist name for a track number", () => {
    expect(parseFileName("2Pac - Changes.mp3")).toEqual({
      artist: "2Pac",
      album: undefined,
      title: "Changes",
      trackNumber: undefined,
    });
  });

  it("uses the whole name as the title when there is no separator", () => {
    expect(parseFileName("Just A Recording.mp3")).toEqual({
      title: "Just A Recording",
      trackNumber: undefined,
    });
  });
});

describe("deriveTrackTags", () => {
  it("derives artist/album from an organized folder layout", () => {
    const d = deriveTrackTags(
      "/storage/emulated/0/Music/Pink Floyd/The Wall/01 Time.mp3",
      "01 Time.mp3",
      NONE,
    );
    expect(d).toEqual({
      title: "Time",
      artist: "Pink Floyd",
      album: "The Wall",
      trackNumber: 1,
    });
  });

  it("derives artist/title from a loose Artist - Title filename", () => {
    const d = deriveTrackTags(
      "/storage/emulated/0/Download/Earth, Wind & Fire - Lets Groove.mp3",
      "Earth, Wind & Fire - Lets Groove.mp3",
      NONE,
    );
    expect(d.artist).toBe("Earth, Wind & Fire");
    expect(d.title).toBe("Lets Groove");
    // "Download" is a generic folder, so it isn't used as the album here.
    expect(d.album).toBeUndefined();
  });

  it("lets embedded tags win over heuristics", () => {
    const d = deriveTrackTags("/Music/A/B/X - Y.mp3", "X - Y.mp3", {
      title: "Real Title",
      artist: "Real Artist",
      album: "Real Album",
    } as AudioMetadata);
    expect(d).toEqual({
      title: "Real Title",
      artist: "Real Artist",
      album: "Real Album",
      trackNumber: undefined,
    });
  });

  it("groups truly unidentifiable files by their folder as a last resort", () => {
    const d = deriveTrackTags(
      "/storage/emulated/0/Download/voice-clip.mp3",
      "voice-clip.mp3",
      NONE,
    );
    expect(d.artist).toBeUndefined();
    expect(d.title).toBe("voice-clip");
    // No artist and no album → fall back to the containing folder name so it
    // doesn't pool into one global Unknown album.
    expect(d.album).toBe("Download");
  });

  it("ignores a generic grandparent folder as the artist", () => {
    const d = deriveTrackTags(
      "/storage/emulated/0/Download/X - Y.mp3",
      "X - Y.mp3",
      NONE,
    );
    expect(d.artist).toBe("X");
  });
});
