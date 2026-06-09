import useServers from "@/stores/servers";

// The local library's source folders live on the active local server entry
// (stores/servers.ts → Server.paths). Centralised here so every local backend
// section reads them the same way.
export function localFolders(): string[] {
  const server = useServers.getState().getCurrentServer();
  return server?.type === "local" ? (server.paths ?? []) : [];
}
