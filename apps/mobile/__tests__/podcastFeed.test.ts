import { InvalidFeedError, parseFeed } from "@/services/podcastFeed";

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>My Show</title>
    <description>A show about things</description>
    <itunes:author>Jane Doe</itunes:author>
    <itunes:image href="https://example.com/cover.jpg"/>
    <item>
      <title>Episode 1</title>
      <description>First episode</description>
      <guid isPermaLink="false">guid-1</guid>
      <pubDate>Wed, 01 Jan 2025 10:00:00 GMT</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:image href="https://example.com/ep1.jpg"/>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="123456"/>
    </item>
    <item>
      <title>Episode 2</title>
      <pubDate>Thu, 02 Jan 2025 10:00:00 GMT</pubDate>
      <itunes:duration>90</itunes:duration>
      <enclosure url="https://example.com/ep2.m4a" type="audio/x-m4a"/>
    </item>
    <item>
      <title>No audio enclosure</title>
    </item>
  </channel>
</rss>`;

describe("podcastFeed parseFeed", () => {
  const feed = parseFeed(FEED);

  it("extracts channel metadata (itunes:image href)", () => {
    expect(feed.title).toBe("My Show");
    expect(feed.description).toBe("A show about things");
    expect(feed.author).toBe("Jane Doe");
    expect(feed.imageUrl).toBe("https://example.com/cover.jpg");
  });

  it("falls back to itunes:owner name when itunes:author is absent", () => {
    const rss = `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
      <title>Owned</title>
      <itunes:owner><itunes:name>Acme Media</itunes:name><itunes:email>a@b.c</itunes:email></itunes:owner>
      <item><title>E</title><enclosure url="https://x/e.mp3"/></item>
    </channel></rss>`;
    expect(parseFeed(rss).author).toBe("Acme Media");
  });

  it("skips items without an audio enclosure", () => {
    expect(feed.items).toHaveLength(2);
    expect(feed.items.map((i) => i.title)).toEqual(["Episode 1", "Episode 2"]);
  });

  it("parses an item with a guid and clock-format duration", () => {
    const ep = feed.items[0];
    expect(ep.guid).toBe("guid-1");
    expect(ep.title).toBe("Episode 1");
    expect(ep.description).toBe("First episode");
    expect(ep.enclosureUrl).toBe("https://example.com/ep1.mp3");
    expect(ep.enclosureType).toBe("audio/mpeg");
    expect(ep.enclosureLength).toBe(123456);
    expect(ep.imageUrl).toBe("https://example.com/ep1.jpg");
    expect(ep.durationSeconds).toBe(3723); // 1*3600 + 2*60 + 3
    expect(ep.publishedAt).toBe(Date.parse("Wed, 01 Jan 2025 10:00:00 GMT"));
  });

  it("falls back to the enclosure URL when guid is missing, and parses raw-seconds duration", () => {
    const ep = feed.items[1];
    expect(ep.guid).toBe("https://example.com/ep2.m4a");
    expect(ep.durationSeconds).toBe(90);
    expect(ep.enclosureType).toBe("audio/x-m4a");
    expect(ep.enclosureLength).toBeUndefined();
  });

  it("reads the RSS <image><url> form when itunes:image is absent", () => {
    const rss = `<rss version="2.0"><channel>
      <title>Plain</title>
      <image><url>https://example.com/plain.png</url></image>
      <item><title>E</title><enclosure url="https://x/e.mp3"/></item>
    </channel></rss>`;
    expect(parseFeed(rss).imageUrl).toBe("https://example.com/plain.png");
  });

  it("throws InvalidFeedError on non-RSS input", () => {
    expect(() => parseFeed("<html><body>nope</body></html>")).toThrow(
      InvalidFeedError,
    );
  });
});
