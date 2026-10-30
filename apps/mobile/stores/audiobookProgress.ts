import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createThrottledScopedJSONStorage } from "@/config/storage";
import type { AbsLocalSession } from "@/services/audiobookshelf/types";
import { currentAuthScope } from "@/stores/auth";
import type {
  AudiobookChapterSpan,
  AudiobookFileSpan,
} from "@/utils/audiobookTimeline";

// What the player needs to know about a book without the server: its files
// (to rebuild the queue and convert positions), chapters, and enough metadata
// to describe it. Snapshotted on every play and download, so a downloaded book
// plays and resumes with the server out of reach.
export interface AudiobookSnapshot {
  itemId: string;
  libraryId: string;
  title: string;
  author: string;
  narrator?: string;
  // False when the server has no cover for it (absent on older snapshots).
  hasCover?: boolean;
  duration: number;
  chapters: AudiobookChapterSpan[];
  files: (AudiobookFileSpan & {
    index: number;
    ino: string;
    mimeType: string;
    ext: string;
    size: number;
  })[];
  savedAt: number;
}

export interface AudiobookPosition {
  currentTime: number;
  duration: number;
  isFinished: boolean;
  updatedAt: number;
}

const MAX_SNAPSHOTS = 60;
const MAX_POSITIONS = 200;
const MAX_PENDING_SESSIONS = 100;

interface AudiobookProgressStore {
  books: Record<string, AudiobookSnapshot>;
  positions: Record<string, AudiobookPosition>;
  pendingSessions: AbsLocalSession[];
  saveBook: (book: AudiobookSnapshot, keep?: ReadonlySet<string>) => void;
  setPosition: (itemId: string, position: AudiobookPosition) => void;
  removePosition: (itemId: string) => void;
  forgetBook: (itemId: string) => void;
  upsertPendingSession: (session: AbsLocalSession) => void;
  removePendingSessions: (ids: string[]) => void;
  __reset: () => void;
}

const initialState = {
  books: {} as Record<string, AudiobookSnapshot>,
  positions: {} as Record<string, AudiobookPosition>,
  pendingSessions: [] as AbsLocalSession[],
};

function newestFirst<T>(
  record: Record<string, T>,
  stamp: (value: T) => number,
  max: number,
  keep?: ReadonlySet<string>,
): Record<string, T> {
  const entries = Object.entries(record);
  if (entries.length <= max) return record;
  entries.sort(([, a], [, b]) => stamp(b) - stamp(a));
  return Object.fromEntries(
    entries.filter(([id], index) => index < max || keep?.has(id)),
  );
}

const useAudiobookProgressBase = create<AudiobookProgressStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      saveBook: (book, keep) => {
        set((state) => ({
          books: newestFirst(
            { ...state.books, [book.itemId]: book },
            (b) => b.savedAt,
            MAX_SNAPSHOTS,
            keep,
          ),
        }));
      },
      setPosition: (itemId, position) => {
        set((state) => ({
          positions: newestFirst(
            { ...state.positions, [itemId]: position },
            (p) => p.updatedAt,
            MAX_POSITIONS,
          ),
        }));
      },
      removePosition: (itemId) => {
        set((state) => {
          if (!(itemId in state.positions)) return state;
          const { [itemId]: _, ...positions } = state.positions;
          return { positions };
        });
      },
      forgetBook: (itemId) => {
        set((state) => {
          if (!(itemId in state.books)) return state;
          const { [itemId]: _, ...books } = state.books;
          return { books };
        });
      },
      upsertPendingSession: (session) => {
        set((state) => {
          const others = state.pendingSessions.filter(
            (s) => s.id !== session.id,
          );
          return {
            pendingSessions: [...others, session].slice(-MAX_PENDING_SESSIONS),
          };
        });
      },
      removePendingSessions: (ids) => {
        if (ids.length === 0) return;
        const drop = new Set(ids);
        set((state) => ({
          pendingSessions: state.pendingSessions.filter((s) => !drop.has(s.id)),
        }));
      },
    }),
    {
      name: "audiobookProgressStore",
      // Positions change every few seconds while a book plays, and each write
      // re-serializes the snapshots alongside them.
      storage: createThrottledScopedJSONStorage(currentAuthScope, 5000),
      skipHydration: true,
      partialize: (state) => ({
        books: state.books,
        positions: state.positions,
        pendingSessions: state.pendingSessions,
      }),
    },
  ),
);

export default useAudiobookProgressBase;
export { useAudiobookProgressBase };
