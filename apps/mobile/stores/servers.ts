import * as z from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "@/config/storage";
import { hasNetworkServerType } from "@/services/backend/serverTraits";
import createSelectors from "@/utils/createSelectors";

export const serverTypeSchema = z.enum([
  "navidrome",
  "opensubsonic",
  "jellyfin",
  // On-device library: no remote server, just filesystem paths (see `paths`).
  "local",
  // Network file share: indexed on-device like `local`, but the files live on a
  // WebDAV server (see `libraryPath`).
  "webdav",
  // Network file share over SMB2/3. Same as `webdav` from the index's point of
  // view; `url` carries `smb://host[:port]/Share` and an optional NTLM domain is
  // typed as `DOMAIN\user` in the username, so it needs no fields of its own.
  "smb",
]);
export type ServerType = z.infer<typeof serverTypeSchema>;

// Custom headers are edited as an ordered list of rows (so a half-typed name
// doesn't collapse two entries into one) and stored as a record — see
// `headerRowsToRecord` / `headerRecordToRows`.
export const headerRowSchema = z.object({
  key: z.string(),
  value: z.string(),
});
export type HeaderRow = z.infer<typeof headerRowSchema>;

export const serverFormSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url().trim().min(1),
  type: serverTypeSchema,
  // Android KeyChain alias for mTLS client-cert auth; presence enables mTLS.
  mtlsAlias: z.string().trim().optional(),
  // Alternative address for the *same* server — see `Server.fallbackUrl`.
  fallbackUrl: z.string().trim().optional(),
  // User-defined headers sent to this server — see `Server.headers`.
  headers: z.array(headerRowSchema).optional(),
});

// `UrlInputField` always emits `<protocol><host>`, so clearing a URL field
// leaves the bare protocol behind rather than an empty string — and
// `z.url().safeParse("https://")` fails. For a required field that error is
// correct (the URL really is missing), but for the optional fallback it would
// block submit with no way to explain why. Treat a bare protocol as blank.
//
// Matches any scheme, not just the web ones: `smb://` parses as a *valid* URL
// (only the special schemes require a host), so an emptied SMB fallback would
// otherwise be saved as an address that can never resolve.
const BARE_PROTOCOL = /^[a-z][a-z0-9+.-]*:\/\/$/i;

export const isBlankUrlInput = (value: string | undefined | null): boolean => {
  const trimmed = (value ?? "").trim();
  return !trimmed || BARE_PROTOCOL.test(trimmed);
};

/** Normalize an optional URL field to `string | undefined` for the store. */
export const cleanOptionalUrl = (
  value: string | undefined | null,
): string | undefined =>
  isBlankUrlInput(value) ? undefined : (value ?? "").trim();

// Shared by every form's superRefine: the fallback is optional, but a non-blank
// one still has to be a real URL.
export function refineFallbackUrl(
  fallbackUrl: string | undefined,
  ctx: z.RefinementCtx,
): void {
  if (isBlankUrlInput(fallbackUrl)) return;
  const parsed = z
    .url()
    .min(1)
    .trim()
    .safeParse((fallbackUrl ?? "").trim());
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      path: ["fallbackUrl"],
      message: parsed.error.issues[0]?.message,
    });
  }
}

// RFC 7230 token: the only characters a header name may contain.
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// A CR/LF (or any control char) in a value is header injection — it would let a
// pasted string append arbitrary headers to every request. Rejected outright.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
const HEADER_VALUE_CONTROL_RE = /[\u0000-\u001F\u007F]/;
// Headers the transports own: letting a user set these breaks the request
// itself (framing) rather than authenticating it. Everything else is allowed —
// including `Authorization` and `User-Agent`, since a WAF that rejects our UA is
// a real reason to reach for this feature.
const RESERVED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "content-type",
  "transfer-encoding",
  "connection",
]);
export const MAX_CUSTOM_HEADERS = 16;

/** Normalize the form's rows into the record shape the store persists. */
export function headerRowsToRecord(
  rows: HeaderRow[] | undefined,
): Record<string, string> | undefined {
  if (!rows?.length) return undefined;
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = (row?.key ?? "").trim();
    if (!key) continue;
    record[key] = (row?.value ?? "").trim();
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

/** Seed a form's rows from a saved server's headers. */
export function headerRecordToRows(
  headers: Record<string, string> | undefined,
): HeaderRow[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

export type HeaderRowIssue = {
  index: number;
  field: "key" | "value";
  /**
   * An i18n *key*, not a translated string: this module is imported by nearly
   * every store test, and pulling in config/i18n would drag its zod-ESM locale
   * graph (which jest can't transform) along with it. CustomHeadersField
   * translates at render time.
   */
  message: string;
};

/**
 * Per-row problems, shared by the schema refinement (which only has to block
 * submit) and by CustomHeadersField (which highlights the offending input). A
 * row with both fields blank is the trailing empty row the editor always keeps,
 * so it reads as absent rather than as an error the user has to clear.
 */
export function validateHeaderRows(
  rows: HeaderRow[] | undefined,
): HeaderRowIssue[] {
  if (!rows?.length) return [];
  const issues: HeaderRowIssue[] = [];
  const seen = new Set<string>();
  let named = 0;
  rows.forEach((row, index) => {
    const key = (row?.key ?? "").trim();
    const rawValue = row?.value ?? "";
    if (!key && !rawValue.trim()) return;
    if (!key) {
      issues.push({
        index,
        field: "key",
        message: "app.servers.headerNameRequired",
      });
      return;
    }
    named += 1;
    const lower = key.toLowerCase();
    if (!HEADER_NAME_RE.test(key) || RESERVED_HEADER_NAMES.has(lower)) {
      issues.push({
        index,
        field: "key",
        message: "app.servers.headerNameInvalid",
      });
      return;
    }
    if (seen.has(lower)) {
      issues.push({
        index,
        field: "key",
        message: "app.servers.headerNameDuplicate",
      });
      return;
    }
    seen.add(lower);
    if (HEADER_VALUE_CONTROL_RE.test(rawValue)) {
      issues.push({
        index,
        field: "value",
        message: "app.servers.headerValueInvalid",
      });
    }
  });
  if (named > MAX_CUSTOM_HEADERS) {
    issues.push({
      index: -1,
      field: "key",
      message: "app.servers.headerTooMany",
    });
  }
  return issues;
}

// Shared by every form's superRefine. Issues are raised on the `headers` field
// as a whole (the editor renders the per-row detail itself from
// `validateHeaderRows`), which is enough to block submit.
export function refineHeaderRows(
  rows: HeaderRow[] | undefined,
  ctx: z.RefinementCtx,
): void {
  for (const issue of validateHeaderRows(rows)) {
    ctx.addIssue({
      code: "custom",
      path: ["headers"],
      message: issue.message,
    });
  }
}

// Add-server form variant: `local` servers have no name/URL (auto-named, fixed
// sentinel URL) and only carry filesystem `paths`, so name/url are validated for
// remote types only. Mirrors `loginSchema` so the form highlights the right
// input for remote servers while letting local through.
export const addServerFormSchema = z
  .object({
    name: z.string().trim(),
    url: z.string().trim(),
    type: serverTypeSchema,
    paths: z.array(z.string()),
    // Sub-path within a network file share to scan (`type === "webdav"`), empty
    // meaning the whole share. Required-but-empty like the fields below, so the
    // inferred input type matches the form's string default.
    libraryPath: z.string().trim(),
    // Required (empty = no cert) so the inferred input type matches the form's
    // string default; presence of a non-empty alias enables mTLS.
    mtlsAlias: z.string().trim(),
    // Required (empty = none) for the same reason; validated in the refine.
    fallbackUrl: z.string().trim(),
    // Always present (the form keeps a trailing empty row); validated in the
    // refine so a half-typed row doesn't block an unrelated field.
    headers: z.array(headerRowSchema),
    plainPasswordAuth: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!hasNetworkServerType(data.type)) return;
    const name = z.string().min(1).trim().safeParse(data.name);
    if (!name.success) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: name.error.issues[0]?.message,
      });
    }
    const url = z.url().min(1).trim().safeParse(data.url);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: url.error.issues[0]?.message,
      });
    }
    refineFallbackUrl(data.fallbackUrl, ctx);
    refineHeaderRows(data.headers, ctx);
  });

// Edit-server form variant: name is always required (editable for every type,
// including the local library), but the URL is validated for remote types only
// since `local` servers carry folders instead.
export const editServerFormSchema = z
  .object({
    name: z.string().trim().min(1),
    url: z.string().trim(),
    type: serverTypeSchema,
    paths: z.array(z.string()),
    libraryPath: z.string().trim(),
    mtlsAlias: z.string().trim(),
    fallbackUrl: z.string().trim(),
    headers: z.array(headerRowSchema),
    plainPasswordAuth: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (!hasNetworkServerType(data.type)) return;
    const url = z.url().min(1).trim().safeParse(data.url);
    if (!url.success) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: url.error.issues[0]?.message,
      });
    }
    refineFallbackUrl(data.fallbackUrl, ctx);
    refineHeaderRows(data.headers, ctx);
  });

export const serverUserSchema = z.object({
  serverId: z.string().min(1),
  username: z.string().trim().min(1),
  // Opt-in saved password for silent server switching (see utils/switchServer).
  // Stored in plaintext like the active session's password in stores/auth.ts.
  password: z.string().optional(),
});

export type Server = {
  id: string;
  name: string;
  url: string;
  current: boolean;
  type: ServerType;
  // Only set for `type === "local"`: the user-selected filesystem source
  // folders the on-device indexer scans. There is a single local server (no
  // remote URL, no multiple accounts), so this is where its config lives.
  paths?: string[];
  // Only set for network file shares (`type === "webdav"`): the sub-path within
  // the share the indexer scans, relative to `url`. Everything above it is
  // ignored, so a share that holds more than music doesn't get walked. Empty or
  // "/" scans the whole share.
  //
  // Deliberately *not* folded into `url`: track addresses are stored relative to
  // `url`, so narrowing or widening the scanned sub-path later doesn't
  // invalidate the ids of files that stay in scope.
  libraryPath?: string;
  // Android KeyChain alias for mTLS client-cert auth (Android only). Only the
  // alias is stored; the private key stays in the OS keystore. Its presence is
  // what enables mTLS for this server. See modules/ssl-trust.
  mtlsAlias?: string;
  // Optional second address for the *same* server, typically a public domain
  // when `url` is a LAN IP. Used when `url` can't be reached (see
  // services/network.ts). Both are routes to one server, never two servers:
  // credentials and content are assumed identical, and only `id` identifies the
  // session — neither URL is part of the storage scope.
  fallbackUrl?: string;
  // User-defined headers sent on every request to this server, both routes.
  // Exists for servers fronted by an authenticating reverse proxy (Cloudflare
  // Access service tokens, Authelia/Authentik, static bearer tokens): the proxy
  // guards the whole origin, so these have to reach every transport — API,
  // reachability probe, audio, downloads and images. See
  // services/serverHeaders.ts.
  headers?: Record<string, string>;
  // Force Subsonic legacy password auth (`p=enc:<hex>`) instead of token+salt
  // (`t`/`s`) for this server. Token auth is the default and is negotiated
  // automatically — a server that answers error 41/42 already falls back on its
  // own (services/auth/authenticate.ts). This is the manual override for the
  // servers that fail some other way, and it costs something: the password
  // travels in every query string, hex-encoded but not encrypted.
  plainPasswordAuth?: boolean;
};

export type ServerUser = {
  serverId: string;
  username: string;
  // Opt-in saved password enabling silent re-auth on server switch. Absent when
  // the user chose not to save credentials.
  password?: string;
};

interface ServersStore {
  servers: Server[];
  users: ServerUser[];
  addServer: (input: {
    name: string;
    url: string;
    type?: ServerType;
    paths?: string[];
    libraryPath?: string;
    mtlsAlias?: string;
    fallbackUrl?: string;
    headers?: Record<string, string>;
    plainPasswordAuth?: boolean;
  }) => Server;
  editServer: (
    id: string,
    patch: {
      name?: string;
      url?: string;
      type?: ServerType;
      paths?: string[];
      libraryPath?: string;
      mtlsAlias?: string;
      fallbackUrl?: string;
      headers?: Record<string, string>;
      plainPasswordAuth?: boolean;
    },
  ) => void;
  removeServer: (id: string) => void;
  setCurrentServer: (id: string) => void;
  getCurrentServer: () => Server | undefined;
  getServerById: (id: string) => Server | undefined;
  getServerByUrl: (url: string) => Server | undefined;
  getUsersForServer: (id: string) => ServerUser[];
  addOrUpdateUser: (user: ServerUser) => void;
  removeUser: (serverId: string, username: string) => void;
  syncServerUsers: (serverId: string, usernames: string[]) => void;
}

// An empty record means "the user cleared every header", which has to be
// distinguishable from "this caller isn't touching headers" (undefined) —
// otherwise removing the last header would silently keep the old one.
const normalizeHeaders = (
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined =>
  headers && Object.keys(headers).length > 0 ? headers : undefined;

const sameHeaders = (
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean => {
  const aKeys = Object.keys(a ?? {});
  const bKeys = Object.keys(b ?? {});
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a?.[key] === b?.[key]);
};

const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const useServersBase = create<ServersStore>()(
  persist(
    (set, get) => ({
      servers: [],
      users: [],
      addServer: ({
        name,
        url,
        type,
        paths,
        libraryPath,
        mtlsAlias,
        fallbackUrl,
        headers,
        plainPasswordAuth,
      }) => {
        const trimmedUrl = url.trim();
        const trimmedName = name.trim();
        const cleanAlias = mtlsAlias?.trim() || undefined;
        const cleanLibraryPath = libraryPath?.trim() || undefined;
        const cleanFallback = cleanOptionalUrl(fallbackUrl);
        const cleanHeaders = normalizeHeaders(headers);
        const existing = get().servers.find((s) => s.url === trimmedUrl);
        if (existing) {
          const patch: Partial<Server> = {};
          if (type && existing.type !== type) patch.type = type;
          if (paths) patch.paths = paths;
          if (
            libraryPath !== undefined &&
            existing.libraryPath !== cleanLibraryPath
          ) {
            patch.libraryPath = cleanLibraryPath;
          }
          if (mtlsAlias !== undefined && existing.mtlsAlias !== cleanAlias) {
            patch.mtlsAlias = cleanAlias;
          }
          if (
            fallbackUrl !== undefined &&
            existing.fallbackUrl !== cleanFallback
          ) {
            patch.fallbackUrl = cleanFallback;
          }
          if (
            headers !== undefined &&
            !sameHeaders(existing.headers, cleanHeaders)
          ) {
            patch.headers = cleanHeaders;
          }
          if (
            plainPasswordAuth !== undefined &&
            !!existing.plainPasswordAuth !== plainPasswordAuth
          ) {
            patch.plainPasswordAuth = plainPasswordAuth;
          }
          if (Object.keys(patch).length > 0) {
            set((state) => ({
              servers: state.servers.map((s) =>
                s.id === existing.id ? { ...s, ...patch } : s,
              ),
            }));
            return { ...existing, ...patch };
          }
          return existing;
        }
        const hasCurrent = get().servers.some((s) => s.current);
        const created: Server = {
          id: generateId(),
          name: trimmedName,
          url: trimmedUrl,
          current: !hasCurrent,
          type: type ?? "navidrome",
          ...(paths ? { paths } : {}),
          ...(cleanLibraryPath ? { libraryPath: cleanLibraryPath } : {}),
          ...(cleanAlias ? { mtlsAlias: cleanAlias } : {}),
          ...(cleanFallback ? { fallbackUrl: cleanFallback } : {}),
          ...(cleanHeaders ? { headers: cleanHeaders } : {}),
          ...(plainPasswordAuth ? { plainPasswordAuth } : {}),
        };
        set((state) => {
          const next = [created, ...state.servers];
          if (next.length > 24) {
            next.length = 24;
          }
          return { servers: next };
        });
        return created;
      },
      editServer: (id, patch) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...(patch.name !== undefined
                    ? { name: patch.name.trim() }
                    : {}),
                  ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
                  ...(patch.type !== undefined ? { type: patch.type } : {}),
                  ...(patch.paths !== undefined ? { paths: patch.paths } : {}),
                  ...(patch.libraryPath !== undefined
                    ? { libraryPath: patch.libraryPath.trim() || undefined }
                    : {}),
                  ...(patch.mtlsAlias !== undefined
                    ? { mtlsAlias: patch.mtlsAlias.trim() || undefined }
                    : {}),
                  ...(patch.fallbackUrl !== undefined
                    ? { fallbackUrl: cleanOptionalUrl(patch.fallbackUrl) }
                    : {}),
                  ...(patch.headers !== undefined
                    ? { headers: normalizeHeaders(patch.headers) }
                    : {}),
                  ...(patch.plainPasswordAuth !== undefined
                    ? { plainPasswordAuth: patch.plainPasswordAuth }
                    : {}),
                }
              : s,
          ),
        }));
      },
      removeServer: (id) => {
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          users: state.users.filter((u) => u.serverId !== id),
        }));
      },
      setCurrentServer: (id) => {
        set((state) => ({
          servers: state.servers.map((s) => ({
            ...s,
            current: s.id === id,
          })),
        }));
      },
      getCurrentServer: () => get().servers.find((s) => s.current),
      getServerById: (id) => get().servers.find((s) => s.id === id),
      getServerByUrl: (url) => {
        const trimmed = url.trim();
        return get().servers.find((s) => s.url === trimmed);
      },
      getUsersForServer: (id) => get().users.filter((u) => u.serverId === id),
      addOrUpdateUser: (user) => {
        const trimmed: ServerUser = {
          serverId: user.serverId,
          username: user.username.trim(),
          ...(user.password !== undefined ? { password: user.password } : {}),
        };
        set((state) => {
          const exists = state.users.some(
            (u) =>
              u.serverId === trimmed.serverId &&
              u.username === trimmed.username,
          );
          if (!exists) return { users: [...state.users, trimmed] };
          // Existing user: overwrite the saved password with the passed value,
          // including clearing it when `password` is omitted (unchecked box).
          return {
            users: state.users.map((u) =>
              u.serverId === trimmed.serverId && u.username === trimmed.username
                ? { ...u, password: user.password }
                : u,
            ),
          };
        });
      },
      removeUser: (serverId, username) => {
        set((state) => ({
          users: state.users.filter(
            (u) => !(u.serverId === serverId && u.username === username),
          ),
        }));
      },
      syncServerUsers: (serverId, usernames) => {
        const unique = Array.from(
          new Set(usernames.map((u) => u.trim()).filter(Boolean)),
        );
        set((state) => {
          // Preserve any saved password for usernames that survive the sync so
          // refreshing the server's user list doesn't wipe stored credentials.
          const existingByName = new Map(
            state.users
              .filter((u) => u.serverId === serverId)
              .map((u) => [u.username, u]),
          );
          return {
            users: [
              ...state.users.filter((u) => u.serverId !== serverId),
              ...unique.map((username) => {
                const saved = existingByName.get(username)?.password;
                return {
                  serverId,
                  username,
                  ...(saved !== undefined ? { password: saved } : {}),
                };
              }),
            ],
          };
        });
      },
    }),
    {
      name: "servers",
      storage: createJSONStorage(() => zustandStorage),
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<ServersStore> | undefined;
        if (!state || version >= 2) return persistedState as ServersStore;
        return {
          ...state,
          servers: (state.servers ?? []).map((s) => ({
            ...s,
            type: (s as Server).type ?? "navidrome",
          })),
        } as ServersStore;
      },
    },
  ),
);

export { useServersBase };

const useServers = createSelectors(useServersBase);

export default useServers;
