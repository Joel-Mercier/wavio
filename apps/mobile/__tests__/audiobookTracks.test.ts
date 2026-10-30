import {
  audiobookTrackId,
  isAudiobookTrackId,
  parseAudiobookTrackId,
} from "@/services/audiobookshelf/keys";
import type { AbsLibraryItem } from "@/services/audiobookshelf/types";
import { audiobookToTracks, snapshotFromItem } from "@/utils/audiobookToTrack";

const item = {
  id: "item-1",
  libraryId: "lib-1",
  mediaType: "book",
  addedAt: 0,
  updatedAt: 0,
  media: {
    coverPath: "/metadata/items/item-1/cover.jpg",
    id: "book-1",
    duration: 300,
    metadata: {
      title: "The Art of War",
      authorName: "Sun Tzu",
      narrators: ["Moira Fogarty"],
    },
    chapters: [{ id: 0, start: 0, end: 300, title: "All" }],
    // Out of order on purpose: the timeline follows startOffset.
    tracks: [
      {
        index: 2,
        ino: "b",
        startOffset: 120,
        duration: 180,
        title: "2",
        contentUrl: "/api/items/item-1/file/b",
        mimeType: "audio/mpeg",
        metadata: { filename: "2.mp3", ext: ".mp3", size: 20 },
      },
      {
        index: 1,
        ino: "a",
        startOffset: 0,
        duration: 120,
        title: "1",
        contentUrl: "/api/items/item-1/file/a",
        mimeType: "audio/mpeg",
        metadata: { filename: "1.mp3", ext: ".mp3", size: 10 },
      },
    ],
  },
} as unknown as AbsLibraryItem;

describe("audiobook track ids", () => {
  it("round-trips an item id that itself contains colons", () => {
    const id = audiobookTrackId("a:b", "42");
    expect(parseAudiobookTrackId(id)).toEqual({ itemId: "a:b", ino: "42" });
  });

  it("rejects anything else", () => {
    expect(isAudiobookTrackId("song-1")).toBe(false);
    expect(isAudiobookTrackId("abs:only")).toBe(false);
    expect(isAudiobookTrackId(undefined)).toBe(false);
  });
});

describe("snapshotFromItem", () => {
  it("orders files by their place in the book", () => {
    const snapshot = snapshotFromItem(item);
    expect(snapshot?.files.map((f) => f.ino)).toEqual(["a", "b"]);
    expect(snapshot?.files[1]).toMatchObject({ ext: "mp3", size: 20 });
    expect(snapshot?.narrator).toBe("Moira Fogarty");
  });

  it("has nothing to play without audio files", () => {
    expect(
      snapshotFromItem({
        ...item,
        media: { ...item.media, tracks: [] },
      } as AbsLibraryItem),
    ).toBeNull();
  });
});

describe("audiobookToTracks", () => {
  it("queues one entry per file, carrying its place in the book", () => {
    const snapshot = snapshotFromItem(item);
    if (!snapshot) throw new Error("no snapshot");
    const tracks = audiobookToTracks(snapshot, "http://abs");
    expect(tracks).toHaveLength(2);
    expect(tracks[1]).toMatchObject({
      id: "abs:item-1:b",
      source: "audiobook",
      audiobookItemId: "item-1",
      bookStartOffset: 120,
      bookDuration: 300,
      duration: 180,
      album: "The Art of War",
      artist: "Sun Tzu",
      title: "The Art of War (2/2)",
      artwork: "http://abs/api/items/item-1/cover?width=400&format=jpeg",
    });
  });

  it("leaves out the artwork of a book the server has no cover for", () => {
    const snapshot = snapshotFromItem({
      ...item,
      media: { ...item.media, coverPath: null },
    } as AbsLibraryItem);
    if (!snapshot) throw new Error("no snapshot");
    expect(
      audiobookToTracks(snapshot, "http://abs")[0].artwork,
    ).toBeUndefined();
  });
});
