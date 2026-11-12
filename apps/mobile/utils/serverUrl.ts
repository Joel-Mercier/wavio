// Paths are appended to a server URL as `${url}/rest/...`, so a trailing slash
// would turn every one into `//rest/...` (issue #277).
export const normalizeServerUrl = (value: string): string =>
  value.trim().replace(/([^/:])\/+$/, "$1");

/** How many of `servers` share each normalized URL. */
export function countNormalizedUrls(
  servers: readonly { url?: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of servers) {
    const url = normalizeServerUrl(s?.url ?? "");
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return counts;
}
