// On-device podcasts back Navidrome and Jellyfin as well as the local library
// (services/backend/podcasts.ts), so their episodes carry the feed's image URL
// in `coverArt` while the active server is a Subsonic one. Wrapping that in a
// /getCoverArt request asked Navidrome for an id it never issued, which is why
// an episode fell back to the placeholder icon while its channel — which reads
// `originalImageUrl` directly — looked fine.
const mockAuth = { serverType: "navidrome" as string, url: "https://nd.test" };

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => true,
}));

jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      artworkCache: {},
      artworkAliases: {},
      getDownloadedTrack: () => undefined,
    }),
  },
}));

jest.mock("@/services/jellyfin/streaming", () => ({
  artworkUrl: (id?: string) => `jellyfin:${id}`,
}));

jest.mock("@/services/openSubsonic/auth", () => ({
  subsonicAuthQuery: () => "u=joel&t=tok&s=salt",
}));

jest.mock("@/services/backend/streaming", () => ({
  streamUrl: (id: string) => `stream:${id}`,
}));

import type {
  PodcastChannel,
  PodcastEpisode,
} from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";
import { podcastEpisodeToTrack } from "@/utils/podcastEpisodeToTrack";

const FEED_IMAGE = "https://assets.pippa.io/shows/floodcast/show-cover.jpg";
const EPISODE_IMAGE = "https://assets.pippa.io/shows/floodcast/s10e43.jpeg";

const episode = (fields: Partial<PodcastEpisode> = {}): PodcastEpisode =>
  ({
    id: "lpe-1",
    streamId: "lpe-1",
    status: "completed",
    title: "S10E43",
    ...fields,
  }) as PodcastEpisode;

const channel = (fields: Partial<PodcastChannel> = {}): PodcastChannel =>
  ({
    id: "lpc-1",
    url: "https://feeds.acast.com/public/shows/floodcast",
    status: "completed",
    ...fields,
  }) as PodcastChannel;

beforeEach(() => {
  mockAuth.serverType = "navidrome";
});

describe("artworkUrl", () => {
  it("passes an absolute image URL through instead of building getCoverArt", () => {
    expect(artworkUrl(EPISODE_IMAGE)).toBe(EPISODE_IMAGE);
  });

  it("still resolves a Subsonic cover id against the server", () => {
    expect(artworkUrl("mf-42")).toContain(
      "https://nd.test/rest/getCoverArt?id=mf-42",
    );
  });
});

describe("podcastEpisodeToTrack", () => {
  it("keeps the episode's own image", () => {
    const track = podcastEpisodeToTrack(
      episode({ coverArt: EPISODE_IMAGE }),
      "FloodCast",
      channel({ originalImageUrl: FEED_IMAGE }),
    );
    expect(track.artwork).toBe(EPISODE_IMAGE);
  });

  it("falls back to the channel image when the episode has none", () => {
    const track = podcastEpisodeToTrack(
      episode(),
      "FloodCast",
      channel({ originalImageUrl: FEED_IMAGE }),
    );
    expect(track.artwork).toBe(FEED_IMAGE);
  });

  it("prefers the channel's cover id so it resolves offline", () => {
    const track = podcastEpisodeToTrack(
      episode(),
      "FloodCast",
      channel({ coverArt: "pc-7", originalImageUrl: FEED_IMAGE }),
    );
    expect(track.coverArt).toBe("pc-7");
    expect(track.artwork).toContain("id=pc-7");
  });

  it("leaves artwork undefined when neither has one", () => {
    const track = podcastEpisodeToTrack(episode(), "FloodCast", channel());
    expect(track.artwork).toBeUndefined();
  });
});
