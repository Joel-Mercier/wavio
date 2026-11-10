import {
  APP_SETTING_RULES,
  describeAppSettings,
  describeServerAddress,
  formatReport,
  scrubReport,
} from "@/services/bugReport/format";

describe("describeAppSettings", () => {
  const rows = Object.fromEntries(
    describeAppSettings({
      streamingFormat: "flac",
      downloadLocationUri:
        "content://com.android.externalstorage.documents/tree/primary%3AJoel",
      autoBackupFolderUri: null,
      internetRadioCountryCode: "FR",
      albumArtNames: ["cover", "my-secret-name"],
      internetRadioFeedTags: ["jazz"],
      showDrawer: true,
      lastUpdateCheckAt: 123,
      albumScreenLayouts: { "library-albums": "grid" },
    }),
  );

  it("prints closed-set values", () => {
    expect(rows.streamingFormat).toBe("flac");
    expect(rows.albumScreenLayouts).toBe('{"library-albums":"grid"}');
  });

  it("reduces folders and country to whether they are set", () => {
    expect(rows.downloadLocationUri).toBe("set");
    expect(rows.autoBackupFolderUri).toBe("not set");
    expect(rows.internetRadioCountryCode).toBe("set");
  });

  it("reduces free-form lists to their size", () => {
    expect(rows["albumArtNames (count)"]).toBe(2);
    expect(rows["internetRadioFeedTags (count)"]).toBe(1);
    expect(JSON.stringify(rows)).not.toContain("my-secret-name");
  });

  it("makes transient layout values readable", () => {
    const layout = Object.fromEntries(
      describeAppSettings({ orientation: 1, windowWidth: 392.72727 }),
    );
    expect(layout.orientation).toBe("portraitUp");
    expect(layout.windowWidth).toBe(393);
  });

  it("leaves out omitted fields", () => {
    expect(rows).not.toHaveProperty("showDrawer");
    expect(rows).not.toHaveProperty("lastUpdateCheckAt");
  });

  it("lists every classified setting once", () => {
    const listed = Object.values(APP_SETTING_RULES).filter(
      (rule) => rule !== "omit",
    ).length;
    expect(describeAppSettings({})).toHaveLength(listed);
  });
});

describe("describeServerAddress", () => {
  const describe_ = (url: string) =>
    Object.fromEntries(describeServerAddress(url));

  it.each([
    ["http://192.168.1.20:4533", "private IPv4", "yes"],
    ["https://music.example.com", "domain name", "no"],
    ["http://100.101.102.103", "private IPv4", "no"],
    ["https://nas.tail1234.ts.net", "Tailscale hostname", "no"],
    ["http://nas.local:8096", "mDNS (.local)", "yes"],
    ["http://[fd00::1]:4533", "private IPv6", "yes"],
    ["http://localhost:4533", "localhost", "yes"],
    ["http://8.8.8.8", "public IPv4", "no"],
  ])("classifies %s", (url, kind, port) => {
    const rows = describe_(url);
    expect(rows["host kind"]).toBe(kind);
    expect(rows["custom port"]).toBe(port);
  });

  it("reports a sub-path without printing it", () => {
    const rows = describe_("https://example.com/navidrome/");
    expect(rows["sub-path"]).toBe("yes");
    expect(rows.scheme).toBe("https");
    expect(JSON.stringify(rows)).not.toContain("example");
  });
});

describe("scrubReport", () => {
  it("masks urls, emails and addresses", () => {
    const text = scrubReport(
      "a: https://music.example.com/x?u=joel\nb: me@example.org\nc: 10.0.0.12\nd: fd00:abcd:1:2::1\ne: aa:bb:cc:dd:ee:ff",
      [],
    );
    expect(text).not.toMatch(/example|joel|10\.0\.0\.12|aa:bb/);
    expect(text).toContain("<url>");
    expect(text).toContain("<email>");
    expect(text).toContain("<ip>");
    expect(text).toContain("<mac>");
  });

  it("keeps version strings", () => {
    expect(scrubReport("version: 0.58.0 (fc1b2a)", [])).toBe(
      "version: 0.58.0 (fc1b2a)",
    );
  });

  it("masks known identifying strings as whole words only", () => {
    const text = scrubReport("user: Joel\nisJoelish: true\nname: My NAS box", [
      "joel",
      "My NAS box",
    ]);
    expect(text).toBe("user: <redacted>\nisJoelish: true\nname: <redacted>");
  });

  it("never masks labels or headings", () => {
    expect(
      scrubReport("#### Server\nadmin: true\nwavio label: admin", ["admin"]),
    ).toBe("#### Server\nadmin: true\nwavio label: <redacted>");
  });

  it("ignores strings too short to be meaningful", () => {
    expect(scrubReport("on: true", ["on"])).toBe("on: true");
  });
});

describe("formatReport", () => {
  it("wraps sections in a collapsible block and drops empty ones", () => {
    const text = formatReport([
      {
        title: "App",
        rows: [
          ["version", "1.4.0"],
          ["missing", undefined],
        ],
      },
      { title: "Empty", rows: [] },
    ]);
    expect(text).toContain("<details>");
    expect(text).toContain("#### App");
    expect(text).toContain("version: 1.4.0");
    expect(text).toContain("missing: —");
    expect(text).not.toContain("Empty");
    expect(formatReport([{ title: "S", rows: [["sep", " - "]] }])).toContain(
      'sep: " - "',
    );
  });
});
