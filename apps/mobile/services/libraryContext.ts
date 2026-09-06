import { getCapabilities } from "@/services/backend/capabilities";
import { currentAuthScope, useAuthBase } from "@/stores/auth";
import {
  activeOverrides,
  useCapabilityOverridesBase,
} from "@/stores/capabilityOverrides";
import { useMusicFoldersBase } from "@/stores/musicFolders";

/**
 * The two things a library search depends on, read non-reactively.
 *
 * services/libraryMatch.ts deliberately takes both as arguments so it stays a
 * pure function of its inputs; React callers get them from useCapabilities and
 * useCurrentMusicFolderId. This is the equivalent for the callers that have no
 * component to read from — endless radio, Android Auto, the scrobbling
 * recommendation tiers — so they don't each hand-roll the same three store
 * reads and quietly disagree about capability overrides.
 */
export type LibrarySearchContext = {
  musicFolderId?: string;
  multiFieldSearch: boolean;
};

export function currentLibrarySearchContext(): LibrarySearchContext {
  const scope = currentAuthScope();
  const capabilities = {
    ...getCapabilities(useAuthBase.getState().serverType),
    ...activeOverrides(useCapabilityOverridesBase.getState().disabledAt),
  };
  return {
    musicFolderId: scope
      ? useMusicFoldersBase.getState().selections[scope]
      : undefined,
    multiFieldSearch: capabilities.multiFieldSearch,
  };
}
