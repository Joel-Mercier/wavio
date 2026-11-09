import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useApp, { SIDEBAR_WIDTH } from "@/stores/app";
import { ARTWORK_GRID_LARGE_SIZE, ARTWORK_THUMB_SIZE } from "@/utils/artwork";
import { coverGridTilePixels } from "@/utils/grid";

// A quarter of upscaling isn't visible at tile size, and staying on the
// thumbnail keeps grids sharing the cache with every list row.
const UPSCALE_TOLERANCE = 1.25;

/** The cover size a COVER_GRID tile should request on this screen. */
export function useGridArtworkSize(): number {
  const { width, scale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((store) => store.isWideLayout);
  const contentWidth =
    width - insets.left - insets.right - (isWideLayout ? SIDEBAR_WIDTH : 0);
  return coverGridTilePixels(width, contentWidth, scale) >
    ARTWORK_THUMB_SIZE * UPSCALE_TOLERANCE
    ? ARTWORK_GRID_LARGE_SIZE
    : ARTWORK_THUMB_SIZE;
}
