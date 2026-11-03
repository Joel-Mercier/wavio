import type { MusicFolder } from "@/services/openSubsonic/types";
import type { MusicFolderSelection } from "@/stores/musicFolders";
import type { ServerType } from "@/stores/servers";

export const sameMusicFolderSelection = (
  a: MusicFolderSelection,
  b: MusicFolderSelection,
) =>
  (a ?? []).length === (b ?? []).length &&
  (a ?? []).every((id, index) => id === b?.[index]);

// Decide whether a persisted music-folder selection still matches what the
// server has. Pure (type-only imports) so it can be unit-tested without the
// store/query graph.
//
// A selection is stored per (server, user), so it can outlive the folders it
// points at — deleted or reindexed on the server — and every folder-scoped
// browse would then answer Subsonic code 70 ("data not found") forever. Stale
// ids are dropped; when none is left, Subsonic/Navidrome fall back to the "all
// libraries" view (undefined), while Jellyfin (which has no "all" option) falls
// back to its first library. A server that takes a single folder keeps only the
// first of several (a selection restored from a multi-library server).
export function reconcileMusicFolderSelection(params: {
  serverType: ServerType | undefined;
  multiSelect: boolean;
  current: MusicFolderSelection;
  folders: MusicFolder[];
}): { action: "keep" } | { action: "set"; ids: MusicFolderSelection } {
  const { serverType, multiSelect, current, folders } = params;
  const known = new Set(folders.map((f) => String(f.id)));
  const valid = (current ?? []).filter((id) => known.has(id));
  const kept = multiSelect ? valid : valid.slice(0, 1);

  let next: MusicFolderSelection = kept.length > 0 ? kept : undefined;
  if (serverType === "jellyfin" && next === undefined) {
    const first = folders[0];
    if (!first) return { action: "keep" };
    next = [String(first.id)];
  }

  return sameMusicFolderSelection(current, next)
    ? { action: "keep" }
    : { action: "set", ids: next };
}

// One tap on a library row of a multi-select picker. Starting from "all
// libraries" narrows to the tapped one; un-ticking the last one, or ticking
// every one, comes back to "all libraries". Ids stay in the server's order.
export function toggleMusicFolder(
  current: MusicFolderSelection,
  id: string,
  allIds: string[],
): MusicFolderSelection {
  const picked = new Set(current);
  if (picked.has(id)) picked.delete(id);
  else picked.add(id);
  const next = allIds.filter((folderId) => picked.has(folderId));
  return next.length === 0 || next.length === allIds.length ? undefined : next;
}

// A one-line summary of the selected libraries' names: they are joined while
// the text stays within `maxLength` characters and the rest are counted. The
// first name is always shown, however long (the caller truncates it).
export function summarizeMusicFolderNames(
  names: string[],
  separator: string,
  maxLength: number,
): { text: string; hiddenCount: number } {
  let text = names[0] ?? "";
  let shown = names.length > 0 ? 1 : 0;
  for (const name of names.slice(1)) {
    const next = `${text}${separator}${name}`;
    if (next.length > maxLength) break;
    text = next;
    shown += 1;
  }
  return { text, hiddenCount: names.length - shown };
}
