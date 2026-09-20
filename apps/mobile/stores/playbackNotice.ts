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
  | "PLAYBACK_SOURCE_UNAVAILABLE"
  /** A remote output (renderer, Cast receiver) would not take the track. */
  | "REMOTE_TRACK_REFUSED"
  /** A remote output stopped answering; playback came back to this device. */
  | "REMOTE_LOST";

export type PlaybackNoticeParams = Record<string, string>;

interface PlaybackNoticeStore {
  notice: PlaybackNoticeCode | null;
  params: PlaybackNoticeParams | null;
  raise: (notice: PlaybackNoticeCode, params?: PlaybackNoticeParams) => void;
  clear: () => void;
}

const usePlaybackNoticeBase = create<PlaybackNoticeStore>()((set) => ({
  notice: null,
  params: null,
  raise: (notice, params) => set({ notice, params: params ?? null }),
  clear: () => set({ notice: null, params: null }),
}));

export const usePlaybackNotice = createSelectors(usePlaybackNoticeBase);
export default usePlaybackNoticeBase;
