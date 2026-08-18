import { create } from "zustand";
import createSelectors from "@/utils/createSelectors";

// A one-shot channel for telling the user that playback failed.
//
// `services/player.ts` is a background service, started from index.js and living
// outside the React tree (it has to: Android Auto binds the media service with no
// Activity at all). It therefore can't call a toast hook. This store is the seam:
// the service raises a code, and a headless component in the app tree renders it.
//
// Deliberately not persisted and not scoped — a playback failure is about the
// track that just stopped, and is meaningless after a restart.

export type PlaybackNoticeCode =
  /** The source couldn't be opened and there is no fallback left to try. */
  "PLAYBACK_SOURCE_UNAVAILABLE";

interface PlaybackNoticeStore {
  notice: PlaybackNoticeCode | null;
  raise: (notice: PlaybackNoticeCode) => void;
  clear: () => void;
}

const usePlaybackNoticeBase = create<PlaybackNoticeStore>()((set) => ({
  notice: null,
  raise: (notice) => set({ notice }),
  clear: () => set({ notice: null }),
}));

export const usePlaybackNotice = createSelectors(usePlaybackNoticeBase);
export default usePlaybackNoticeBase;
