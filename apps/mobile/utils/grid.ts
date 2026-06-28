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

// Tailwind margin classes that lay a grid cell out as column `column` of
// `columns`: flush on the outer edge (first cell flush-left, last flush-right)
// with an 8dp inner margin elsewhere, giving even ~16dp gutters between cells.
// For `columns === 3` this reproduces the original hard-coded library scheme.
export function gridCellMarginClass(column: number, columns: number) {
  return `${column === 0 ? "ml-0" : "ml-2"} ${
    column === columns - 1 ? "mr-0" : "mr-2"
  }`;
}
