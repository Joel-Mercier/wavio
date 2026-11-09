// Number of columns a responsive grid should render for a given window width.
// Fits as many cells of at least `minItemWidth` (dp) as the usable width allows,
// then clamps to [minColumns, maxColumns]. This scales grids up on wide screens
// (tablets, foldables, landscape) while keeping phones at their existing counts.
export function gridColumnCount(
  windowWidth: number,
  {
    minItemWidth,
    minColumns,
    maxColumns,
    paddingHorizontal = 24,
  }: {
    minItemWidth: number;
    minColumns: number;
    maxColumns: number;
    paddingHorizontal?: number;
  },
) {
  const usable = windowWidth - paddingHorizontal * 2;
  const fit = Math.floor(usable / minItemWidth);
  return Math.min(maxColumns, Math.max(minColumns, fit));
}

// The album / library cover grid, shared by every screen that offers one so the
// tiles can work out how large they're drawn (see coverGridTilePixels).
export const COVER_GRID = {
  minItemWidth: 160,
  minColumns: 3,
  maxColumns: 5,
} as const;

// Horizontal padding inside each cover grid tile (`px-2`, 8dp a side).
const COVER_GRID_TILE_PADDING = 16;

// The physical pixels across a cover in a COVER_GRID tile. Screens pick their
// column count from the window, but lay the tiles out in what's left of it
// beside the wide layout's sidebar, so both widths are needed.
export function coverGridTilePixels(
  windowWidth: number,
  contentWidth: number,
  scale: number,
) {
  const columns = gridColumnCount(windowWidth, COVER_GRID);
  const usable = contentWidth - 24 * 2;
  return (usable / columns - COVER_GRID_TILE_PADDING) * scale;
}

// Tailwind margin classes that lay a grid cell out as column `column` of
// `columns`: flush on the outer edge (first cell flush-left, last flush-right)
// with an 8dp inner margin elsewhere, giving even ~16dp gutters between cells.
// For `columns === 3` this reproduces the original hard-coded library scheme.
export function gridCellMarginClass(column: number, columns: number) {
  return `${column === 0 ? "ml-0" : "ml-2"} ${
    column === columns - 1 ? "mr-0" : "mr-2"
  }`;
}
