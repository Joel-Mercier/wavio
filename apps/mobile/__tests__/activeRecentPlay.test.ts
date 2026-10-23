import type { QueueTrack } from "@/stores/queue";
import { activeRecentPlayKey, recentPlayKey } from "@/utils/activeRecentPlay";

const track = (overrides: Partial<QueueTrack> = {}): QueueTrack => ({
  id: "t1",
  url: "https://example.com/t1",
  ...overrides,
});

describe("activeRecentPlayKey", () => {
  it("is null without a playing track", () => {
    expect(
      activeRecentPlayKey({ type: "album", id: "a1", name: "A" }, null),
    ).toBeNull();
  });

  it.each(["album", "playlist", "artist"] as const)(
    "matches the %s shortcut with the same id",
    (type) => {
      expect(activeRecentPlayKey({ type, id: "x1", name: "X" }, track())).toBe(
        recentPlayKey({ type, id: "x1" }),
      );
    },
  );

  it("matches the favorites shortcut for the Favorites source", () => {
    expect(
      activeRecentPlayKey(
        { type: "likedSongs", id: "favorites", name: "Favorites" },
        track(),
      ),
    ).toBe(recentPlayKey({ type: "favorites", id: "favorites" }));
  });

  it.each(["allSongs", "likedSongs"] as const)(
    "matches the artist shortcut for an artist's %s list",
    (type) => {
      expect(
        activeRecentPlayKey({ type, id: "ar1", name: "Artist" }, track()),
      ).toBe(recentPlayKey({ type: "artist", id: "ar1" }));
      expect(activeRecentPlayKey({ type, name: "Artist" }, track())).toBeNull();
    },
  );

  it("matches a radio station by the playing track id", () => {
    expect(
      activeRecentPlayKey(null, track({ id: "station-1", isRadio: true })),
    ).toBe(recentPlayKey({ type: "internetRadioStation", id: "station-1" }));
  });

  it("is null for sources no shortcut can point at", () => {
    expect(
      activeRecentPlayKey({ type: "folder", id: "f1", name: "F" }, track()),
    ).toBeNull();
    expect(activeRecentPlayKey({ type: "mix", name: "M" }, track())).toBeNull();
    expect(activeRecentPlayKey(null, track())).toBeNull();
  });
});
