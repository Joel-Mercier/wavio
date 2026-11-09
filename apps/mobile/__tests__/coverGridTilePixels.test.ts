import { coverGridTilePixels } from "@/utils/grid";

const SIDEBAR = 240;

describe("coverGridTilePixels", () => {
  it("keeps phone tiles within a 300px thumbnail's reach", () => {
    expect(coverGridTilePixels(393, 393, 2.75)).toBeLessThan(300);
    expect(coverGridTilePixels(412, 412, 3.5)).toBeLessThan(375);
  });

  it("sizes a tile from the width left beside the sidebar", () => {
    // Landscape phone: 5 columns from the window, laid out in ~585dp.
    expect(coverGridTilePixels(873, 873 - SIDEBAR - 48, 2.75)).toBeLessThan(
      300,
    );
    expect(coverGridTilePixels(673, 673 - SIDEBAR, 2.625)).toBeLessThan(375);
  });

  it("outgrows the thumbnail on a large tablet", () => {
    expect(coverGridTilePixels(1366, 1366 - SIDEBAR, 2)).toBeGreaterThan(375);
  });
});
