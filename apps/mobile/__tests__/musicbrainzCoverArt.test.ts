import { looksLikeImage } from "@/services/musicbrainz/coverArt";

const head = (...bytes: number[]) => new Uint8Array(bytes);

describe("looksLikeImage", () => {
  it("accepts the formats the Cover Art Archive serves", () => {
    expect(looksLikeImage(head(0xff, 0xd8, 0xff, 0xe0))).toBe(true); // JPEG
    expect(looksLikeImage(head(0x89, 0x50, 0x4e, 0x47))).toBe(true); // PNG
    expect(looksLikeImage(head(0x47, 0x49, 0x46, 0x38))).toBe(true); // GIF
    expect(looksLikeImage(head(0x52, 0x49, 0x46, 0x46))).toBe(true); // WebP
  });

  it("rejects an HTML error page served in place of a cover", () => {
    // "<htm" — archive.org returns one of these on a bad day. Saved under a
    // .jpg name it renders as a broken image and every decoder rejects it,
    // which is what breaks colour extraction downstream.
    expect(looksLikeImage(head(0x3c, 0x68, 0x74, 0x6d))).toBe(false);
    expect(looksLikeImage(head(0x3c, 0x21, 0x44, 0x4f))).toBe(false); // "<!DO"
  });

  it("rejects a truncated or empty response", () => {
    expect(looksLikeImage(head())).toBe(false);
    expect(looksLikeImage(head(0xff))).toBe(false);
    expect(looksLikeImage(head(0xff, 0xd8))).toBe(false);
  });
});
