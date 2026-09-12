import { create } from "zustand";
import createSelectors from "@/utils/createSelectors";

// The playlists this session has added tracks to, most recent first. Powers the
// one-tap "Add to «name»" row in the track actions sheet and the "Recent"
// section at the top of the add-to-playlist screen (issue #195: adding hundreds
// of songs to the same handful of playlists).
//
// Deliberately not persisted — this is a shortcut for a burst of curation, not a
// preference, and a stale target from days ago is worse than no shortcut at all.
// Being session-only also means it can never bleed across a (server, user)
// switch on disk; the in-memory copy is cleared by the reset pass in
// app/(app)/_layout.tsx.
//
// The name is cached alongside the id so the sheet can label the row without a
// playlists query — the whole point of that row is to skip the round trip.

export interface PlaylistTarget {
  id: string;
  name: string;
}

const MAX_RECENT_TARGETS = 5;

interface PlaylistTargetsStore {
  recentTargets: PlaylistTarget[];
  recordTargets: (targets: PlaylistTarget[]) => void;
  forget: (id: string) => void;
  __reset: () => void;
}

const usePlaylistTargetsBase = create<PlaylistTargetsStore>()((set) => ({
  recentTargets: [],
  recordTargets: (targets) => {
    if (targets.length === 0) return;
    set((state) => {
      const added = new Set(targets.map((target) => target.id));
      return {
        recentTargets: [
          ...targets,
          ...state.recentTargets.filter((target) => !added.has(target.id)),
        ].slice(0, MAX_RECENT_TARGETS),
      };
    });
  },
  forget: (id) => {
    set((state) => ({
      recentTargets: state.recentTargets.filter((target) => target.id !== id),
    }));
  },
  __reset: () => {
    set({ recentTargets: [] });
  },
}));

export const usePlaylistTargets = createSelectors(usePlaylistTargetsBase);
export default usePlaylistTargetsBase;
