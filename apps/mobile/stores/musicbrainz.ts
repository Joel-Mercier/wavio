import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDynamicScopedStorage } from "@/config/storage";
import { ALL_TAG_FIELDS, type TagField } from "@/services/musicbrainz/tagging";
import { currentAuthScope } from "@/stores/auth";
import createSelectors from "@/utils/createSelectors";

// Where a MusicBrainz correction lands.
// - "override": stored in the local index only (see track_tag_overrides). Fully
//   reversible, cross-platform, but invisible to any other music app.
// - "files": also written into the file's own tags, so the correction is
//   permanent and portable. Android only, and irreversible — which is why
//   auto-apply is deliberately not offered for it (see autoApplyThreshold).
export type TagWriteMode = "override" | "files";

// Above this confidence a match is applied without asking. Tuned high: the cost
// of a wrong auto-apply is a mis-tagged album, the cost of being conservative is
// one extra tap in the review queue.
const DEFAULT_AUTO_APPLY_THRESHOLD = 0.9;

interface MusicBrainzStore {
  tagWriteMode: TagWriteMode;
  autoApplyThreshold: number;
  // Auto-apply is only honoured in "override" mode; file writes always go
  // through review. Exposed as a setting so the behaviour is discoverable, but
  // `shouldAutoApply` is the thing callers should ask.
  autoApplyEnabled: boolean;
  fieldsToWrite: TagField[];
  lastScanAt: number | null;
  setTagWriteMode: (mode: TagWriteMode) => void;
  setAutoApplyThreshold: (threshold: number) => void;
  setAutoApplyEnabled: (enabled: boolean) => void;
  toggleField: (field: TagField) => void;
  setLastScanAt: (at: number | null) => void;
  __reset: () => void;
}

const initialState = {
  tagWriteMode: "override" as TagWriteMode,
  autoApplyThreshold: DEFAULT_AUTO_APPLY_THRESHOLD,
  autoApplyEnabled: true,
  fieldsToWrite: ALL_TAG_FIELDS,
  lastScanAt: null,
};

const useMusicBrainzBase = create<MusicBrainzStore>()(
  persist(
    (set) => ({
      ...initialState,

      __reset: () => {
        set(() => ({ ...initialState }));
      },

      setTagWriteMode: (tagWriteMode) => {
        set({ tagWriteMode });
      },
      setAutoApplyThreshold: (autoApplyThreshold) => {
        set({ autoApplyThreshold });
      },
      setAutoApplyEnabled: (autoApplyEnabled) => {
        set({ autoApplyEnabled });
      },
      toggleField: (field) => {
        set((state) => ({
          fieldsToWrite: state.fieldsToWrite.includes(field)
            ? state.fieldsToWrite.filter((f) => f !== field)
            : [...state.fieldsToWrite, field],
        }));
      },
      setLastScanAt: (lastScanAt) => {
        set({ lastScanAt });
      },
    }),
    {
      name: "musicBrainzStore",
      storage: createJSONStorage(() =>
        createDynamicScopedStorage(currentAuthScope),
      ),
      skipHydration: true,
      partialize: (state) => ({
        tagWriteMode: state.tagWriteMode,
        autoApplyThreshold: state.autoApplyThreshold,
        autoApplyEnabled: state.autoApplyEnabled,
        fieldsToWrite: state.fieldsToWrite,
        lastScanAt: state.lastScanAt,
      }),
    },
  ),
);

/**
 * Whether a match is confident enough to apply unattended.
 *
 * Writing to files is irreversible, so it never auto-applies regardless of
 * confidence — a bad match there rewrites the user's actual files, while a bad
 * override is one tap to undo.
 */
export function shouldAutoApply(confidence: number): boolean {
  const { tagWriteMode, autoApplyEnabled, autoApplyThreshold } =
    useMusicBrainzBase.getState();
  if (tagWriteMode === "files") return false;
  if (!autoApplyEnabled) return false;
  return confidence >= autoApplyThreshold;
}

const useMusicBrainz = createSelectors(useMusicBrainzBase);

export default useMusicBrainz;
export { DEFAULT_AUTO_APPLY_THRESHOLD, useMusicBrainzBase };
