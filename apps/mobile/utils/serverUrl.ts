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

const TAILSCALE_IPV4 =
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/;

/**
 * Whether a URL points at a Tailscale address (a MagicDNS `*.ts.net` name, a
 * 100.64.0.0/10 IPv4 or an fd7a:115c:a1e0::/48 IPv6). Only devices on the tailnet
 * can reach those, which rules out speakers and TVs we cast to.
 */
export function isTailnetUrl(url: string | undefined): boolean {
  if (!url) return false;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return false;
  }
  return (
    host.endsWith(".ts.net") ||
    TAILSCALE_IPV4.test(host) ||
    host.startsWith("fd7a:115c:a1e0:")
  );
}
