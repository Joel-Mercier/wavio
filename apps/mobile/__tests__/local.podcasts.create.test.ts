// createPodcastChannel fetches + parses a new feed on-device, so it can reject an
// invalid feed up front instead of leaving an empty channel in the list. Mock the
// repository (no SQLite) and global.fetch (no network) to assert that contract.

const mockRepo = {
  rows: new Map<string, { id: string; url: string; status: string }>(),
  byUrl: new Map<string, { id: string; url: string; status: string }>(),
};

jest.mock("@/services/local/repository", () => ({
  queryPodcastChannelByUrl: (url: string) => mockRepo.byUrl.get(url) ?? null,
  insertPodcastChannel: (row: { id: string; url: string; status: string }) => {
    mockRepo.rows.set(row.id, row);
    mockRepo.byUrl.set(row.url, row);
  },
  deletePodcastChannel: (id: string) => {
    const row = mockRepo.rows.get(id);
    mockRepo.rows.delete(id);
    if (row) mockRepo.byUrl.delete(row.url);
  },
  updatePodcastChannelMeta: jest.fn(),
  updatePodcastChannelStatus: jest.fn(),
  upsertPodcastEpisodes: jest.fn(),
  queryPodcastChannelById: (id: string) => mockRepo.rows.get(id) ?? null,
  queryPodcastChannels: () => [...mockRepo.rows.values()],
  queryPodcastEpisodeById: jest.fn(),
  queryPodcastEpisodesByChannel: () => [],
  queryPodcastEpisodesByChannelIds: () => [],
}));

jest.mock("@/services/local/keys", () => ({
  localPodcastEpisodeId: (u: string) => `ep:${u}`,
  newLocalPodcastChannelId: () => `chan:${mockRepo.rows.size}`,
}));

jest.mock("@/services/errorReporting", () => ({
  reportError: jest.fn(),
}));

// The create path doesn't touch the mappers, but importing the module pulls them
// in transitively — and they reach config/i18n's zod-ESM graph, which jest can't
// transform. Stub them out.
jest.mock("@/services/local/mappers", () => ({
  mapChannelRow: jest.fn(),
  mapEpisodeRow: jest.fn(),
}));

jest.mock("@/services/local/unsupported", () => ({
  localEnvelope: (data: unknown) => ({ data }),
  LocalUnsupportedError: class extends Error {},
}));

import { createPodcastChannel } from "@/services/local/podcasts";
import { InvalidFeedError } from "@/services/podcastFeed";

const VALID_FEED = `<rss version="2.0"><channel>
  <title>My Show</title>
  <item><title>E1</title><enclosure url="https://x/e1.mp3"/></item>
</channel></rss>`;

function mockFetch(body: string, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockRepo.rows.clear();
  mockRepo.byUrl.clear();
  jest.clearAllMocks();
});

describe("createPodcastChannel (local)", () => {
  it("rolls back and throws InvalidFeedError when the URL isn't an RSS feed", async () => {
    mockFetch("<html><body>not a feed</body></html>");
    await expect(
      createPodcastChannel("https://www.ilpost.it/podcasts/indagini/"),
    ).rejects.toBeInstanceOf(InvalidFeedError);
    // No empty channel left behind.
    expect(mockRepo.rows.size).toBe(0);
  });

  it("keeps the channel when the feed is a valid RSS document", async () => {
    mockFetch(VALID_FEED);
    await createPodcastChannel("https://valid.example/feed.xml");
    expect(mockRepo.rows.size).toBe(1);
  });

  it("preserves an existing channel when re-adding a now-failing feed", async () => {
    const url = "https://valid.example/feed.xml";
    mockRepo.rows.set("chan:existing", {
      id: "chan:existing",
      url,
      status: "completed",
    });
    mockRepo.byUrl.set(url, { id: "chan:existing", url, status: "completed" });
    mockFetch("<html>down</html>");
    await expect(createPodcastChannel(url)).resolves.toBeDefined();
    // Existing channel is not deleted.
    expect(mockRepo.rows.has("chan:existing")).toBe(true);
  });
});
