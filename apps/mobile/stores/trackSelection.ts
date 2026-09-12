import { create } from "zustand";
import type { Child } from "@/services/openSubsonic/types";
import createSelectors from "@/utils/createSelectors";

// Multi-select mode for track rows: entered from the track actions sheet, driven
// by tapping rows, and consumed by components/tracks/TrackSelectionBar.
//
// Deliberately not persisted and not scoped. A selection is a gesture in
// progress, not user data — it is cleared the moment the user navigates away
// (the bar watches the pathname), so there is nothing to survive a restart and
// nothing that could bleed across a (server, user) switch.
//
// `selected` keeps whole `Child` objects because the bulk actions need them
// (childToTrack for the queue); `selectedIds` exists purely so a row can answer
// "am I selected?" in O(1) — every visible row runs that lookup on each change.

interface TrackSelectionStore {
  active: boolean;
  selected: Child[];
  selectedIds: Record<string, true>;
  // The focused screen's full track list, published by useTrackListPress, which
  // is what "select all" acts on. Empty on screens that don't use that hook.
  pool: Child[];
  // The bar's measured height, published by TrackSelectionBar so
  // useScreenBottomPadding can reserve exactly what it covers. 0 until the bar
  // has laid out once, which the hook reads as "fall back to the nominal
  // height" — a constant alone would be wrong for anyone running a raised
  // system font scale, where every row in the bar grows.
  barHeight: number;
  // Called with a track from a row's actions sheet (that track starts
  // selected), or with none from a collection's sheet, where the user opens
  // selection mode first and picks the rows afterwards.
  enter: (track?: Child) => void;
  toggle: (track: Child) => void;
  selectAll: () => void;
  deselectAll: () => void;
  exit: () => void;
  setPool: (pool: Child[]) => void;
  setBarHeight: (height: number) => void;
  __reset: () => void;
}

// A playlist can hold the same track twice, and a row answers "am I selected?"
// by id, so both of its rows highlight together. The selection therefore keeps
// one entry per distinct id: otherwise the count would say 2 for one track and
// "add to playlist" would append it twice.
const dedupeById = (tracks: Child[]): Child[] => {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
};

const idsOf = (tracks: Child[]): Record<string, true> => {
  const ids: Record<string, true> = {};
  for (const track of tracks) {
    ids[track.id] = true;
  }
  return ids;
};

const useTrackSelectionBase = create<TrackSelectionStore>()((set, get) => ({
  active: false,
  selected: [],
  selectedIds: {},
  pool: [],
  barHeight: 0,
  enter: (track) => {
    set({
      active: true,
      selected: track ? [track] : [],
      selectedIds: track ? { [track.id]: true } : {},
    });
  },
  toggle: (track) => {
    const { selected, selectedIds } = get();
    if (selectedIds[track.id]) {
      const next = selected.filter((item) => item.id !== track.id);
      set({ selected: next, selectedIds: idsOf(next) });
      return;
    }
    set({
      selected: [...selected, track],
      selectedIds: { ...selectedIds, [track.id]: true },
    });
  },
  selectAll: () => {
    const { pool } = get();
    if (pool.length === 0) return;
    const next = dedupeById(pool);
    set({ selected: next, selectedIds: idsOf(next) });
  },
  deselectAll: () => {
    set({ selected: [], selectedIds: {} });
  },
  exit: () => {
    set({ active: false, selected: [], selectedIds: {} });
  },
  setPool: (pool) => {
    set({ pool });
  },
  setBarHeight: (height) => {
    if (get().barHeight === height) return;
    set({ barHeight: height });
  },
  // barHeight is deliberately left alone: it measures chrome, not selection
  // state, and the bar only re-publishes it the next time it lays out.
  __reset: () => {
    set({ active: false, selected: [], selectedIds: {}, pool: [] });
  },
}));

export const useTrackSelection = createSelectors(useTrackSelectionBase);
export default useTrackSelectionBase;
