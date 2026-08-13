// The Recent episodes feed merges two episode shapes that encode their publish
// date differently — Taddy in unix seconds, a Subsonic episode as an ISO string
// over JSON but as a real Date from the local mapper — so the merge has to
// normalize all three before it can interleave them.
import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import type { PodcastEpisode as TaddyPodcastEpisode } from "@/services/taddyPodcasts/types";
import { buildPodcastFeedItems } from "@/utils/podcastFeedItems";

const channel = (
  id: string,
  episodes: Partial<PodcastEpisode>[],
): PodcastChannel =>
  ({
    id,
    title: `Channel ${id}`,
    url: `https://feed/${id}`,
    status: "completed",
    episode: episodes.map((episode, index) => ({
      id: `${id}-ep-${index}`,
      channelId: id,
      status: "completed",
      streamId: `${id}-stream-${index}`,
      title: `Episode ${index}`,
      ...episode,
    })),
  }) as PodcastChannel;

const taddy = (uuid: string, datePublished: number): TaddyPodcastEpisode =>
  ({ uuid, name: uuid, datePublished }) as TaddyPodcastEpisode;

const build = (args: {
  channels?: PodcastChannel[];
  favoriteChannelIds?: string[];
  taddyEpisodes?: TaddyPodcastEpisode[];
  taddyHasMore?: boolean;
}) =>
  buildPodcastFeedItems({
    channels: args.channels ?? [],
    favoriteChannelIds: new Set(args.favoriteChannelIds ?? []),
    taddyEpisodes: args.taddyEpisodes ?? [],
    taddyHasMore: args.taddyHasMore,
  });

const iso = (date: string) => new Date(date).toISOString();

describe("buildPodcastFeedItems", () => {
  it("returns nothing when there is nothing to merge", () => {
    expect(build({})).toEqual([]);
  });

  it("only expands channels that are favorited", () => {
    const items = build({
      channels: [
        channel("a", [{ publishDate: iso("2026-08-10") as unknown as Date }]),
        channel("b", [{ publishDate: iso("2026-08-11") as unknown as Date }]),
      ],
      favoriteChannelIds: ["a"],
    });

    expect(items).toHaveLength(1);
    const [item] = items;
    if (item.kind !== "server") throw new Error("expected a server item");
    expect(item.episode.id).toBe("a-ep-0");
  });

  it("carries the parent channel on every server item", () => {
    const [item] = build({
      channels: [channel("a", [{}])],
      favoriteChannelIds: ["a"],
    });

    expect(item.kind).toBe("server");
    if (item.kind !== "server") throw new Error("expected a server item");
    expect(item.channel.id).toBe("a");
    expect(item.channel.title).toBe("Channel a");
  });

  it("interleaves both sources newest first across all three date encodings", () => {
    const items = build({
      channels: [
        channel("a", [
          // ISO string, as Subsonic sends it over JSON.
          { id: "iso", publishDate: iso("2026-08-09") as unknown as Date },
          // Real Date, as services/local/mappers.ts builds it.
          { id: "date", publishDate: new Date("2026-08-12") },
        ]),
      ],
      favoriteChannelIds: ["a"],
      taddyEpisodes: [
        // Unix seconds.
        taddy("t-newest", Date.UTC(2026, 7, 13) / 1000),
        taddy("t-oldest", Date.UTC(2026, 7, 1) / 1000),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "taddy:t-newest",
      "server:date",
      "server:iso",
      "taddy:t-oldest",
    ]);
  });

  it("sorts undated episodes last rather than to the top", () => {
    const items = build({
      channels: [
        channel("a", [
          { id: "undated" },
          { id: "dated", publishDate: new Date("2020-01-01") },
        ]),
      ],
      favoriteChannelIds: ["a"],
      taddyEpisodes: [taddy("t-1", Date.UTC(2026, 7, 13) / 1000)],
    });

    expect(items.map((item) => item.key)).toEqual([
      "taddy:t-1",
      "server:dated",
      "server:undated",
    ]);
  });

  it("sorts an unparseable publish date last too", () => {
    const items = build({
      channels: [
        channel("a", [
          { id: "garbage", publishDate: "not a date" as unknown as Date },
          { id: "dated", publishDate: new Date("2020-01-01") },
        ]),
      ],
      favoriteChannelIds: ["a"],
    });

    expect(items.map((item) => item.key)).toEqual([
      "server:dated",
      "server:garbage",
    ]);
  });

  it("keeps the two id-spaces from colliding on the list key", () => {
    const shared = "collide";
    const items = build({
      channels: [
        channel("a", [{ id: shared, publishDate: new Date("2026-08-10") }]),
      ],
      favoriteChannelIds: ["a"],
      taddyEpisodes: [taddy(shared, Date.UTC(2026, 7, 10) / 1000)],
    });

    expect(new Set(items.map((item) => item.key)).size).toBe(2);
    expect(items.map((item) => item.key).sort()).toEqual([
      "server:collide",
      "taddy:collide",
    ]);
  });

  it("orders ties deterministically instead of by input order", () => {
    const sameDay = Date.UTC(2026, 7, 10);
    const forward = build({
      taddyEpisodes: [
        taddy("b", sameDay / 1000),
        taddy("a", sameDay / 1000),
        taddy("c", sameDay / 1000),
      ],
    });
    const reversed = build({
      taddyEpisodes: [
        taddy("c", sameDay / 1000),
        taddy("a", sameDay / 1000),
        taddy("b", sameDay / 1000),
      ],
    });

    expect(forward.map((item) => item.key)).toEqual([
      "taddy:a",
      "taddy:b",
      "taddy:c",
    ]);
    expect(reversed.map((item) => item.key)).toEqual(
      forward.map((item) => item.key),
    );
  });

  // Regression: a channel arrives whole while Taddy arrives 25 at a time, so
  // merging everything against a partial Taddy list used to dump a dead
  // podcast's entire back catalogue in one block as soon as the loaded Taddy
  // pages ran out — no interleaving at all past that point.
  describe("windowing against the loaded Taddy pages", () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 7, 13);
    // A channel that stopped publishing a year ago, like FloodCast.
    const dormant = channel("dormant", [
      { id: "old-1", publishDate: new Date(now - 365 * day) },
      { id: "old-2", publishDate: new Date(now - 372 * day) },
    ]);
    // Two recent Taddy episodes — the first loaded page.
    const firstPage = [
      taddy("recent-1", (now - 5 * day) / 1000),
      taddy("recent-2", (now - 9 * day) / 1000),
    ];

    it("holds back server episodes older than the oldest loaded Taddy episode", () => {
      const items = build({
        channels: [dormant],
        favoriteChannelIds: ["dormant"],
        taddyEpisodes: firstPage,
        taddyHasMore: true,
      });

      expect(items.map((item) => item.key)).toEqual([
        "taddy:recent-1",
        "taddy:recent-2",
      ]);
    });

    it("pulls them in as later Taddy pages lower the floor", () => {
      const items = build({
        channels: [dormant],
        favoriteChannelIds: ["dormant"],
        taddyEpisodes: [
          ...firstPage,
          taddy("older-1", (now - 366 * day) / 1000),
        ],
        taddyHasMore: true,
      });

      // Only the server episode above the new floor crosses over, in date order.
      expect(items.map((item) => item.key)).toEqual([
        "taddy:recent-1",
        "taddy:recent-2",
        "server:old-1",
        "taddy:older-1",
      ]);
    });

    it("shows everything once Taddy has no more pages", () => {
      const items = build({
        channels: [dormant],
        favoriteChannelIds: ["dormant"],
        taddyEpisodes: firstPage,
        taddyHasMore: false,
      });

      expect(items.map((item) => item.key)).toEqual([
        "taddy:recent-1",
        "taddy:recent-2",
        "server:old-1",
        "server:old-2",
      ]);
    });

    it("never windows when there are no Taddy subscriptions", () => {
      const items = build({
        channels: [dormant],
        favoriteChannelIds: ["dormant"],
        taddyHasMore: true,
      });

      expect(items.map((item) => item.key)).toEqual([
        "server:old-1",
        "server:old-2",
      ]);
    });

    it("keeps server episodes newer than the whole loaded Taddy page", () => {
      const active = channel("active", [
        { id: "fresh", publishDate: new Date(now - day) },
      ]);
      const items = build({
        channels: [active],
        favoriteChannelIds: ["active"],
        taddyEpisodes: firstPage,
        taddyHasMore: true,
      });

      expect(items[0].key).toBe("server:fresh");
    });
  });

  it("handles a favorited channel the server returned without episodes", () => {
    expect(
      build({
        channels: [{ id: "a", url: "", status: "completed" } as PodcastChannel],
        favoriteChannelIds: ["a"],
      }),
    ).toEqual([]);
  });
});
