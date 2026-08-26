// Parsing for SMB server URLs and addresses. Deliberately dependency-free —
// `stores/servers.ts` and `stores/auth.ts` validate the login form with
// `parseSmbUrl`, and neither can afford to pull the file source (and through it
// the native module) into its graph.
//
// The share name lives in the URL rather than in its own `Server` field, and an
// optional NTLM domain is typed as `DOMAIN\user` in the username field. That
// keeps a share configurable through the exact same form as a WebDAV one — url,
// library sub-path, username, password — with no new columns to migrate.

export const SMB_ADDRESS_PREFIX = "smb:";

export const SMB_DEFAULT_PORT = 445;

export type SmbTarget = {
  host: string;
  port: number;
  /** Share name, without slashes. */
  share: string;
};

/**
 * Host, port and share from a configured server URL.
 *
 * Null when there is no share segment, which is the check that matters: `z.url()`
 * happily accepts `smb://host`, and a connection without a share name can't be
 * made at all. Sub-paths below the share are ignored here — those are the
 * indexer's `libraryPath`, so that narrowing the scanned folder later doesn't
 * change the server's identity or invalidate any track id.
 */
export function parseSmbUrl(url: string): SmbTarget | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Tolerate a pasted `\\host\share`, which is how Windows shows a share.
  const forwardSlashed = trimmed.replace(/\\/g, "/");
  // The scheme and the `//` are both optional: someone typing an address into a
  // field labelled "server URL" reasonably writes `192.168.1.10/Music`.
  const withoutScheme = forwardSlashed
    .replace(/^smb:/i, "")
    .replace(/^\/\//, "");

  const [authority, ...rest] = withoutScheme.split("/");
  if (!authority) return null;

  const share =
    rest
      .join("/")
      .replace(/^\/+|\/+$/g, "")
      .split("/")[0] ?? "";
  if (!share) return null;

  const match = /^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/.exec(authority);
  if (!match) return null;
  const host = (match[1] ?? match[2] ?? "").trim();
  if (!host) return null;

  const port = match[3] ? Number.parseInt(match[3], 10) : SMB_DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return null;

  return { host, port, share };
}

/**
 * Splits an optional NTLM domain off a username. `WORKGROUP\joel` is the form
 * Windows and every NAS admin UI use; a forward slash is tolerated because the
 * backslash is awkward to type on a phone keyboard.
 */
export function splitDomainUser(username: string): {
  domain: string;
  user: string;
} {
  const trimmed = username.trim();
  const separator = /[\\/]/.exec(trimmed);
  if (!separator) return { domain: "", user: trimmed };
  const index = separator.index;
  return {
    domain: trimmed.slice(0, index).trim(),
    user: trimmed.slice(index + 1).trim(),
  };
}

/** Share-relative path for an address, or null when it isn't one of ours. */
export function smbPathOf(address: string): string | null {
  return address.startsWith(SMB_ADDRESS_PREFIX)
    ? address.slice(SMB_ADDRESS_PREFIX.length)
    : null;
}

/**
 * The configured library sub-path, as an address. An empty value scans the whole
 * share root. Mirrors `normalizeRoot` in services/fileSource/webdav.ts.
 */
export function normalizeSmbRoot(root: string): string {
  if (root.startsWith(SMB_ADDRESS_PREFIX)) return root;
  const trimmed = root.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!trimmed) return `${SMB_ADDRESS_PREFIX}/`;
  return `${SMB_ADDRESS_PREFIX}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}
