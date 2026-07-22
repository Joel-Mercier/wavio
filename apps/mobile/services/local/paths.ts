import useServers from "@/stores/servers";

// The local library's source folders live on the active local server entry
// (stores/servers.ts → Server.paths). Centralised here so every local backend
// section reads them the same way.
export function localFolders(): string[] {
  const server = useServers.getState().getCurrentServer();
  return server?.type === "local" ? (server.paths ?? []) : [];
}

// Order-insensitive equality of two folder lists. Used to tell whether the
// configured source folders changed (and thus need a rescan).
export function samePaths(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((p) => set.has(p));
}

// True when any folder in `previous` is absent from `next` — i.e. a source
// folder was dropped, so its albums get pruned and any home shortcut pointing at
// them goes stale. A pure addition leaves existing albums (and shortcuts) valid.
export function foldersRemoved(previous: string[], next: string[]): boolean {
  const nextSet = new Set(next);
  return previous.some((f) => !nextSet.has(f));
}

// Turn an Android Storage Access Framework tree URI into a readable folder path.
// e.g. content://com.android.externalstorage.documents/tree/primary%3AMusic%2FRock
// -> "Music/Rock". Non-SAF entries (legacy plain paths) just drop the scheme.
export function folderLabel(uri: string): string {
  if (!uri.startsWith("content://")) return uri.replace(/^file:\/\//, "");
  try {
    const treeIdx = uri.indexOf("/tree/");
    const decoded = decodeURIComponent(
      treeIdx >= 0 ? uri.slice(treeIdx + "/tree/".length) : uri,
    );
    const colon = decoded.lastIndexOf(":");
    return (colon >= 0 ? decoded.slice(colon + 1) : decoded) || decoded;
  } catch {
    return uri;
  }
}
