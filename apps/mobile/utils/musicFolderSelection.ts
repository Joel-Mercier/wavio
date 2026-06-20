import type { MusicFolder } from "@/services/openSubsonic/types";
import type { ServerType } from "@/stores/servers";

// Decide whether a persisted music-folder selection still matches what the
// server has. Pure (type-only imports) so it can be unit-tested without the
// store/query graph.
//
// A selection is stored per (server, user), so it can outlive the folder it
// points at — deleted or reindexed on the server — and every folder-scoped
// browse would then answer Subsonic code 70 ("data not found") forever. When the
// selection no longer exists: Subsonic/Navidrome fall back to the "all
// libraries" view (undefined), while Jellyfin (which has no "all" option) falls
// back to its first library.
export function reconcileMusicFolderSelection(params: {
  serverType: ServerType | undefined;
  current: string | undefined;
  folders: MusicFolder[];
}): { action: "keep" } | { action: "set"; id: string | undefined } {
  const { serverType, current, folders } = params;
  const isValid =
    current !== undefined && folders.some((f) => String(f.id) === current);

  if (serverType === "jellyfin") {
    if (isValid) return { action: "keep" };
    const first = folders[0];
    return first ? { action: "set", id: String(first.id) } : { action: "keep" };
  }

  if (current !== undefined && !isValid) {
    return { action: "set", id: undefined };
  }
  return { action: "keep" };
}
