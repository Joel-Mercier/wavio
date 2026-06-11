import useBookmarks from "@/stores/bookmarks";

// Stable empty array so the hook returns the same reference for tracks without
// bookmarks, avoiding needless re-renders.
const EMPTY: number[] = [];

// Reactive selector for a single track's bookmark positions, with a stable
// empty-array fallback. Accepts undefined so callers don't need to guard a
// missing current track.
export function useTrackBookmarks(trackId: string | undefined) {
  return useBookmarks((state) =>
    trackId ? (state.bookmarks[trackId] ?? EMPTY) : EMPTY,
  );
}
