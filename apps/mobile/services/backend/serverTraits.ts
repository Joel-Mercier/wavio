import type { ServerType } from "@/stores/servers";

// Which *properties* a server type has, as opposed to which type it is.
//
// `serverType === "local"` used to answer five different questions at once,
// because for the on-device library all four happened to have the same answer:
// its content comes from the SQLite index, its files sit on this phone, there is
// no server to reach, and there is only ever one of it. Network file shares
// (WebDAV / SMB) break that coincidence — they are index-backed like `local` but
// remote, credentialed and multi-instance like Navidrome — so every call site has
// to say which of the four it actually meant.
//
// Kept dependency-free (a type-only import) so `stores/auth.ts` and
// `config/queryClient.ts` can use it without an import cycle. The zero-argument
// counterparts that read the active server live in `services/backend/dispatch.ts`.

// Content is served from the on-device SQLite index (services/local/*) rather
// than a remote API, whatever put the files there.
const INDEX_BACKED = new Set<ServerType>(["local", "webdav", "smb"]);

// The media files are on this device, reachable as `file://` with no network.
const ON_DEVICE_FILES = new Set<ServerType>(["local"]);

// There is a remote server to authenticate against, probe for reachability and
// lose connectivity to.
const NO_NETWORK_SERVER = new Set<ServerType>(["local"]);

// Exactly one row can exist, with a sentinel url/username and a fixed storage
// scope (LOCAL_AUTH_SCOPE) rather than a per-(server, user) one.
const SINGLETON = new Set<ServerType>(["local"]);

// Talks HTTP(S) to a host, so per-host custom headers (services/serverHeaders.ts)
// and TLS trust (services/sslTrust.ts) apply. Deliberately its own set rather
// than an alias of "has a network server": SMB has a server but speaks its own
// wire protocol, and its credentials live inside the native module — the only
// HTTP it involves is its own loopback bridge, which authenticates on a token in
// the URL and must never be handed a saved server's headers.
const NON_HTTP = new Set<ServerType>(["local", "smb"]);

/** Backend calls are answered from the on-device SQLite index. */
export const isIndexBackedType = (type: ServerType): boolean =>
  INDEX_BACKED.has(type);

/** The bytes are on this phone — no fetch, no bandwidth, no server transcode. */
export const filesAreOnDeviceType = (type: ServerType): boolean =>
  ON_DEVICE_FILES.has(type);

/** There is a server to reach, authenticate against and probe. */
export const hasNetworkServerType = (type: ServerType): boolean =>
  !NO_NETWORK_SERVER.has(type);

/** One row only, with a sentinel identity and a fixed storage scope. */
export const isSingletonServerType = (type: ServerType): boolean =>
  SINGLETON.has(type);

/** Talks HTTP(S) to a host, so per-host headers and TLS trust apply. */
export const speaksHttpType = (type: ServerType): boolean =>
  !NON_HTTP.has(type);

/**
 * A network file share (WebDAV, SMB): indexed on this device, but the files are
 * across a network. The composite the share-specific UI keys off — a scanned
 * sub-path to configure, a scan that costs bandwidth — without naming either
 * protocol, so a third one needs no changes here.
 */
export const isNetworkShareType = (type: ServerType): boolean =>
  isIndexBackedType(type) && hasNetworkServerType(type);
