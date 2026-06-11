import useServers from "@/stores/servers";

// The local library's source folders live on the active local server entry
// (stores/servers.ts → Server.paths). Centralised here so every local backend
// section reads them the same way.
export function localFolders(): string[] {
  const server = useServers.getState().getCurrentServer();
  return server?.type === "local" ? (server.paths ?? []) : [];
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
