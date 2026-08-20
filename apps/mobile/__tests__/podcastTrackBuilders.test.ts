// The three podcast track builders have to agree on the field set
// services/podcastProgress.ts consumes, and podcastProgressEntryToTrack must
// rebuild its stream URL from the entry's *inputs* — a stored URL would carry
// credentials and a server route that only the live queue gets repointed.
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: make(),
    createScopedStorage: () => make(),
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `https://server/stream/${id}`,
}));

jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id: string) => `https://server/art/${id}`,
}));

import useOffline from "@/stores/offline";
import type { PodcastProgressEntry } from "@/stores/podcasts";
import type { QueueTrack } from "@/stores/queue";
import {
  podcastEpisodeToTrack,
  podcastProgressEntryToTrack,
  podcastStreamUrl,
  taddyEpisodeToTrack,
} from "@/utils/podcastEpisodeToTrack";

const entry = (
  overrides: Partial<PodcastProgressEntry> = {},
): PodcastProgressEntry => ({
  id: "ep-1",
  source: "server",
  scope: "scope",
  streamId: "stream-9",
  title: "Episode 1",
  seriesName: "Series",
  duration: 3600,
  position: 900,
  updatedAt: 1,
  ...overrides,
});

const setDownloaded = (ids: string[]) =>
  useOffline.setState({
    downloadedTracks: Object.fromEntries(
      ids.map((id) => [id, { id, path: `file://${id}`, size: 1 }]),
    ),
  } as never);

beforeEach(() => setDownloaded([]));

describe("podcastProgressEntryToTrack", () => {
  test("a server entry streams through its streamId, not its episode id", () => {
    const track = podcastProgressEntryToTrack(entry());
    expect(track.url).toBe("https://server/stream/stream-9");
    expect(track.podcastSource).toBe("server");
    expect(track.isOffline).toBe(false);
  });

  test("a taddy entry streams its stored enclosure url", () => {
    const track = podcastProgressEntryToTrack(
      entry({
        source: "taddy",
        scope: undefined,
        streamId: undefined,
        audioUrl: "https://cdn.example/ep.mp3",
      }),
    );
    expect(track.url).toBe("https://cdn.example/ep.mp3");
    expect(track.podcastSource).toBe("taddy");
  });

  test("a downloaded episode plays from disk, keyed on the episode id", () => {
    setDownloaded(["ep-1"]);
    const track = podcastProgressEntryToTrack(entry());
    expect(track.url).toBe("file://ep-1");
    expect(track.isOffline).toBe(true);
  });

  test("artwork falls back to the cover-art id when no direct url is stored", () => {
    expect(
      podcastProgressEntryToTrack(entry({ coverArt: "cover-1" })).artwork,
    ).toBe("https://server/art/cover-1");
    expect(
      podcastProgressEntryToTrack(
        entry({ artwork: "https://img.example/a.jpg", coverArt: "cover-1" }),
      ).artwork,
    ).toBe("https://img.example/a.jpg");
  });
});

// A Cast receiver fetches the media itself, so it needs a URL it can reach —
// and never streamUrl(episode id), which is a Subsonic endpoint that knows
// nothing about a Taddy uuid and ignores an OpenSubsonic episode's streamId.
describe("podcastStreamUrl", () => {
  test("keeps a third-party enclosure url as-is", () => {
    expect(
      podcastStreamUrl({
        id: "uuid-1",
        url: "https://cdn.example/ep.mp3",
      } as QueueTrack),
    ).toBe("https://cdn.example/ep.mp3");
  });

  test("keeps a server stream url as-is", () => {
    expect(
      podcastStreamUrl({
        id: "ep-1",
        url: "https://server/stream/stream-9",
        streamId: "stream-9",
      } as QueueTrack),
    ).toBe("https://server/stream/stream-9");
  });

  test("rebuilds a network url for a downloaded episode", () => {
    // The receiver can't read the phone's filesystem.
    expect(
      podcastStreamUrl({
        id: "uuid-1",
        url: "file:///downloads/uuid-1.mp3",
        audioUrl: "https://cdn.example/ep.mp3",
      } as QueueTrack),
    ).toBe("https://cdn.example/ep.mp3");
    expect(
      podcastStreamUrl({
        id: "ep-1",
        url: "file:///downloads/ep-1.mp3",
        streamId: "stream-9",
      } as QueueTrack),
    ).toBe("https://server/stream/stream-9");
  });

  test("falls back to the episode id only when nothing else is known", () => {
    expect(
      podcastStreamUrl({
        id: "ep-1",
        url: "file:///downloads/ep-1.mp3",
      } as QueueTrack),
    ).toBe("https://server/stream/ep-1");
  });
});

describe("builders agree on what recordPodcastProgress reads", () => {
  test("podcastEpisodeToTrack carries the fields an entry is built from", () => {
    const track = podcastEpisodeToTrack(
      {
        id: "ep-1",
        title: "Episode 1",
        streamId: "stream-9",
        channelId: "ch-1",
        duration: 3600,
        status: "completed",
      } as never,
      "Series",
      { coverArt: "cover-1" } as never,
    );
    expect(track).toMatchObject({
      podcastSource: "server",
      streamId: "stream-9",
      channelId: "ch-1",
      source: "podcast",
    });
    // The stream URL is built from the streamId, never the episode id.
    expect(track.url).toBe("https://server/stream/stream-9");
  });

  test("taddyEpisodeToTrack carries audioUrl and the series uuid", () => {
    const track = taddyEpisodeToTrack(
      {
        uuid: "u-1",
        name: "Episode 1",
        audioUrl: "https://cdn.example/ep.mp3",
        imageUrl: "https://img.example/a.jpg",
        duration: 3600,
        podcastSeries: { uuid: "series-1", name: "Series" },
      } as never,
      "Fallback series",
    );
    expect(track).toMatchObject({
      id: "u-1",
      podcastSource: "taddy",
      audioUrl: "https://cdn.example/ep.mp3",
      seriesUuid: "series-1",
      artist: "Fallback series",
      source: "podcast",
    });
  });

  test("taddyEpisodeToTrack coerces a string duration and falls back to `id`", () => {
    // Route params all arrive as strings, and the episode screen's param bag
    // names the episode `id` rather than `uuid`.
    const track = taddyEpisodeToTrack({
      id: "from-params",
      name: "Episode",
      audioUrl: "https://cdn.example/ep.mp3",
      duration: "1800",
    } as never);
    expect(track.id).toBe("from-params");
    expect(track.duration).toBe(1800);
  });
});
