// SoulSync's /api/v1 hands back `thumb_url` exactly as its library scan read it
// off the media server — a relative path, never a fetchable URL. Only the web
// UI normalises it, so the app has to resolve those ids against its own server.
const mockAuth = { serverType: "navidrome" as string, url: "https://nd.test" };

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("@/utils/artwork", () => ({
  artworkUrl: (id?: string, size?: number) => `art:${id}:${size ?? ""}`,
}));

import { soulSyncAlbumArtworkUrl } from "@/services/soulsync/artwork";
import type { SoulSyncLibraryAlbum } from "@/services/soulsync/types";

const album = (
  fields: Partial<SoulSyncLibraryAlbum> = {},
): SoulSyncLibraryAlbum => ({
  id: 1,
  title: "Discovery",
  year: 2001,
  thumb_url: null,
  server_source: "navidrome",
  created_at: null,
  ...fields,
});

describe("soulSyncAlbumArtworkUrl", () => {
  beforeEach(() => {
    mockAuth.serverType = "navidrome";
  });

  it("resolves a Subsonic cover id against the user's own server", () => {
    const url = soulSyncAlbumArtworkUrl(
      album({ thumb_url: "/rest/getCoverArt?id=al-42" }),
      96,
    );
    expect(url).toBe("art:al-42:96");
  });

  // OpenSubsonic servers share Navidrome's id space and its cover endpoint.
  it("accepts an opensubsonic session for a navidrome-scanned row", () => {
    mockAuth.serverType = "opensubsonic";
    expect(
      soulSyncAlbumArtworkUrl(album({ thumb_url: "/rest/getCoverArt?id=x" })),
    ).toBe("art:x:");
  });

  it("resolves a Jellyfin item id", () => {
    mockAuth.serverType = "jellyfin";
    const url = soulSyncAlbumArtworkUrl(
      album({
        server_source: "jellyfin",
        thumb_url: "/Items/abc123/Images/Primary",
      }),
    );
    expect(url).toBe("art:abc123:");
  });

  // The id only means anything against the server it was scanned from, so a
  // mismatch has to fall through to the icon rather than build a URL that
  // resolves to someone else's album.
  it("gives up when the row came from a different server than the session", () => {
    mockAuth.serverType = "jellyfin";
    expect(
      soulSyncAlbumArtworkUrl(album({ thumb_url: "/rest/getCoverArt?id=x" })),
    ).toBeUndefined();
  });

  // Plex is not a backend the app can talk to at all.
  it("gives up on a Plex path", () => {
    expect(
      soulSyncAlbumArtworkUrl(
        album({
          server_source: "plex",
          thumb_url: "/library/metadata/9/thumb/1",
        }),
      ),
    ).toBeUndefined();
  });

  // Metadata enrichment can replace the scanned path with a provider's cover,
  // which is already fetchable.
  it("passes an absolute URL through untouched", () => {
    expect(
      soulSyncAlbumArtworkUrl(album({ thumb_url: "https://cdn/x.jpg" })),
    ).toBe("https://cdn/x.jpg");
  });

  it("is undefined when the row has no thumb at all", () => {
    expect(soulSyncAlbumArtworkUrl(album())).toBeUndefined();
  });
});
