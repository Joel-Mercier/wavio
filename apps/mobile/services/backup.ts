import * as Application from "expo-application";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import Share from "react-native-share";
import * as z from "zod";
import { getAuthScope, LOCAL_AUTH_SCOPE } from "@/config/authScope";
import {
  flushPendingScopedWrites,
  notePersistedWrite,
  storage,
} from "@/config/storage";
import { isSingletonServerType } from "@/services/backend/serverTraits";
import {
  BACKUP_EXCLUDED_SCOPED_STORE_NAMES,
  BACKUP_SECRET_FIELDS,
  GLOBAL_KEYS,
  SCOPED_STORE_NAMES,
} from "@/services/backupStoreKeys";
import {
  buildScopeRemap,
  remapOfflineTrackPaths,
} from "@/services/storageScopeMigration";
import { useAppBase } from "@/stores/app";
import useMusicFolders from "@/stores/musicFolders";
import { useOidcBase } from "@/stores/oidc";
import usePodcasts from "@/stores/podcasts";
import { useServersBase } from "@/stores/servers";

// v1 files carry URL-derived scopes; v2 carries id-derived ones (see
// config/authScope.ts). Both are readable — restoreBackup remaps a v1 file's
// scopes on the way in.
const backupSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  appVersion: z.string(),
  exportedAt: z.string(),
  global: z.record(z.string(), z.string()),
  scoped: z.array(
    z.object({
      scope: z.string(),
      values: z.record(z.string(), z.string()),
    }),
  ),
});

const BACKUP_VERSION = 2;

export type BackupFile = z.infer<typeof backupSchema>;

export const isBackupExcluded = (storeName: string) =>
  BACKUP_EXCLUDED_SCOPED_STORE_NAMES.some((excluded) =>
    storeName.startsWith(excluded),
  );

function collectScopes(allKeys: string[]): string[] {
  const { servers, users } = useServersBase.getState();
  const serverById = new Map(servers.map((s) => [s.id, s] as const));
  const scopes = new Set<string>();
  for (const user of users) {
    const server = serverById.get(user.serverId);
    if (!server) continue;
    scopes.add(
      isSingletonServerType(server.type)
        ? LOCAL_AUTH_SCOPE
        : getAuthScope(server.id, user.username),
    );
  }
  // Also recover scopes directly from storage so data for users missing from
  // the `users` list (legacy state, removed users) is still backed up. A scoped
  // key is `<scope>:<storeName>`, and scopes never contain ":" (getAuthScope
  // replaces non-alphanumerics with "_"), so the scope is the slice before the
  // first matching store-name marker.
  for (const key of allKeys) {
    for (const name of SCOPED_STORE_NAMES) {
      const idx = key.indexOf(`:${name}`);
      if (idx > 0) {
        scopes.add(key.slice(0, idx));
        break;
      }
    }
  }
  return Array.from(scopes);
}

const withoutKeys = (value: unknown, keys: readonly string[]): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of keys) delete copy[key];
  return copy;
};

// No password, token or API key ever travels in a backup file: the export goes
// out through the OS share sheet (cloud drives, chat apps, email), and anyone
// holding the file must still sign in to the server to use it.
// - `auth` keeps only the session's identity, for the re-login prompt, and is
//   never marked signed in: the restored account opens on the login screen,
//   even if the app is killed before the restore dialog is dismissed.
// - `servers` loses saved passwords and custom header values, which are proxy
//   credentials (Cloudflare Access service tokens, static bearer tokens).
// - Every other store drops its BACKUP_SECRET_FIELDS.
// Runs on restore as well, so an older file that still carries any of these
// can't bring them back. Fails closed: a credential-bearing blob that can't be
// parsed is left out rather than passed through unsanitized.
export function sanitizeForBackup(
  name: string,
  value: string,
): string | undefined {
  const secretFields = BACKUP_SECRET_FIELDS[name];
  if (name !== "auth" && name !== "servers" && !secretFields) return value;
  try {
    const parsed = JSON.parse(value) as { state?: Record<string, unknown> };
    if (!parsed?.state || typeof parsed.state !== "object") return undefined;
    let state: Record<string, unknown> = { ...parsed.state };
    if (name === "auth") {
      state = {
        ...state,
        isAuthenticated: false,
        password: "",
        token: null,
        subsonicSalt: null,
        subsonicToken: null,
        jellyfinAccessToken: null,
      };
    } else if (name === "servers") {
      if (Array.isArray(state.users)) {
        state.users = state.users.map((user) =>
          withoutKeys(user, ["password"]),
        );
      }
      if (Array.isArray(state.servers)) {
        state.servers = state.servers.map((server) =>
          withoutKeys(server, ["headers"]),
        );
      }
    }
    if (secretFields) {
      state = withoutKeys(state, secretFields) as Record<string, unknown>;
    }
    return JSON.stringify({ ...parsed, state });
  } catch {
    return undefined;
  }
}

// Which keys a backup carries, without reading any values: the streamed writer
// reads each one only when it gets to it.
function planScopedKeys(): { scope: string; names: string[] }[] {
  flushPendingScopedWrites();
  const allKeys = storage.getAllKeys();
  return collectScopes(allKeys).map((scope) => {
    const prefix = `${scope}:`;
    const names: string[] = [];
    for (const key of allKeys) {
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (!isBackupExcluded(name)) names.push(name);
    }
    return { scope, names };
  });
}

function readGlobalValue(key: string): string | undefined {
  const value = storage.getString(key);
  return value === undefined ? undefined : sanitizeForBackup(key, value);
}

function readScopedValue(scope: string, name: string): string | undefined {
  const value = storage.getString(`${scope}:${name}`);
  return value === undefined ? undefined : sanitizeForBackup(name, value);
}

const appVersion = () => Application.nativeApplicationVersion ?? "unknown";

export function buildBackup(): BackupFile {
  const plan = planScopedKeys();
  const global: Record<string, string> = {};
  for (const key of GLOBAL_KEYS) {
    const value = readGlobalValue(key);
    if (value !== undefined) global[key] = value;
  }
  const scoped = plan.map(({ scope, names }) => {
    const values: Record<string, string> = {};
    for (const name of names) {
      const value = readScopedValue(scope, name);
      if (value !== undefined) values[name] = value;
    }
    return { scope, values };
  });
  return {
    version: BACKUP_VERSION,
    appVersion: appVersion(),
    exportedAt: new Date().toISOString(),
    global,
    scoped,
  };
}

// buildBackup() + JSON.stringify holds the whole library twice and serializes it
// in one uninterrupted pass on the JS thread: hundreds of milliseconds on a big
// library, a visible stall in the UI and a late JS-driven track transition
// during playback. This writes the same JSON (compact) in fragments instead,
// reading each value only when it is reached. Every WRITE_CHUNK_CHARS goes to
// disk through an async native write, which is also where the JS thread gets to
// handle everything else.
const WRITE_CHUNK_CHARS = 256 * 1024;
// A single stored value can be several megabytes (play history, the offline
// index), so long strings are escaped a slice at a time.
const STRINGIFY_SLICE_CHARS = 64 * 1024;

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

export async function writeBackupFile(file: File): Promise<void> {
  const plan = planScopedKeys();
  if (file.exists) file.delete();
  file.create();

  let buffer = "";
  const flush = async () => {
    if (!buffer) return;
    const chunk = buffer;
    buffer = "";
    await file.write(chunk, { append: true });
  };
  const emit = async (fragment: string) => {
    buffer += fragment;
    if (buffer.length >= WRITE_CHUNK_CHARS) await flush();
  };
  const emitString = async (value: string) => {
    if (value.length <= STRINGIFY_SLICE_CHARS) {
      await emit(JSON.stringify(value));
      return;
    }
    await emit('"');
    let start = 0;
    while (start < value.length) {
      let end = Math.min(start + STRINGIFY_SLICE_CHARS, value.length);
      // Never split a surrogate pair: each half alone would be escaped as a lone
      // surrogate, or mangled outright when the chunk is encoded as UTF-8.
      if (end < value.length && isHighSurrogate(value.charCodeAt(end - 1))) {
        end -= 1;
      }
      await emit(JSON.stringify(value.slice(start, end)).slice(1, -1));
      start = end;
    }
    await emit('"');
  };
  const emitRecord = async (
    keys: readonly string[],
    read: (key: string) => string | undefined,
  ) => {
    await emit("{");
    let first = true;
    for (const key of keys) {
      const value = read(key);
      if (value === undefined) continue;
      await emit(`${first ? "" : ","}${JSON.stringify(key)}:`);
      first = false;
      await emitString(value);
    }
    await emit("}");
  };

  await emit(
    `{"version":${BACKUP_VERSION},"appVersion":${JSON.stringify(appVersion())},"exportedAt":${JSON.stringify(new Date().toISOString())},"global":`,
  );
  await emitRecord(GLOBAL_KEYS, readGlobalValue);
  await emit(',"scoped":[');
  for (const [index, { scope, names }] of plan.entries()) {
    await emit(
      `${index === 0 ? "" : ","}{"scope":${JSON.stringify(scope)},"values":`,
    );
    await emitRecord(names, (name) => readScopedValue(scope, name));
    await emit("}");
  }
  await emit("]}");
  await flush();
}

export function timestampSlug(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function exportBackup(): Promise<void> {
  const fileName = `wavio-backup-${timestampSlug()}.json`;
  const file = new File(Paths.cache, fileName);
  await writeBackupFile(file);

  await Share.open({
    title: fileName,
    url: file.uri,
    filename: fileName,
    type: "application/json",
    failOnCancel: false,
  });
}

export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const text = await file.text();
  const json = JSON.parse(text);
  return backupSchema.parse(json);
}

export type RestoreOutcome = {
  // The restored server to route the user to for re-login, or null if the
  // backup had no authenticated session.
  serverId: string | null;
  username: string | null;
};

/**
 * Bring a v1 file's URL-derived scopes onto the id-derived scheme. Without this
 * a pre-migration backup would restore into keys nothing reads, silently losing
 * every scoped store it carried.
 *
 * The mapping is rebuilt from the backup's own `servers` blob rather than live
 * state, so it stays correct even when restoring onto a different device.
 */
function migrateBackupScopes(backup: BackupFile): BackupFile["scoped"] {
  if (backup.version >= 2) return backup.scoped;
  const remap = buildScopeRemap(
    backup.global.servers,
    backup.scoped.map((s) => s.scope),
  );
  if (remap.size === 0) return backup.scoped;
  return backup.scoped.map(({ scope, values }) => {
    const to = remap.get(scope);
    if (!to) return { scope, values };
    // The download directory has already been moved by the storage migration, so
    // the paths this file carries point at the old location.
    const offline = remapOfflineTrackPaths(values.offlineStore, scope, to);
    return {
      scope: to,
      values: offline ? { ...values, offlineStore: offline } : values,
    };
  });
}

export async function restoreBackup(
  backup: BackupFile,
): Promise<RestoreOutcome> {
  const scoped = migrateBackupScopes(backup);
  const scopes = scoped.map((s) => s.scope);
  flushPendingScopedWrites();
  const allKeys = storage.getAllKeys();
  const keysToClear = new Set<string>(GLOBAL_KEYS);
  for (const key of allKeys) {
    if (scopes.some((scope) => key.startsWith(`${scope}:`))) {
      keysToClear.add(key);
    }
  }
  for (const key of keysToClear) {
    storage.remove(key);
  }

  for (const [key, value] of Object.entries(backup.global)) {
    const sanitized = sanitizeForBackup(key, value);
    if (sanitized === undefined) continue;
    storage.set(key, sanitized);
    notePersistedWrite(key, () => true);
  }
  for (const { scope, values } of scoped) {
    for (const [key, value] of Object.entries(values)) {
      if (isBackupExcluded(key)) continue;
      const sanitized = sanitizeForBackup(key, value);
      if (sanitized !== undefined) storage.set(`${scope}:${key}`, sanitized);
    }
  }

  // Single-sign-on sessions aren't part of a backup, but they would outlive
  // the data they belonged to and sign a restored server in silently. Restore
  // replaces everything, so they go too: whoever restores signs in themselves.
  useOidcBase.setState({ sessions: {}, expiredNotice: null });

  // Bring the global, account-independent stores into memory so the restored
  // server list and app settings take effect immediately and can't be
  // re-persisted over by stale pre-restore state. The auth store is
  // deliberately NOT rehydrated here: doing so would hot-swap the active
  // account in place (isAuthenticated stays true while the server changes),
  // which leaves React Query and the scoped-store hydration guard pointing at
  // the previous server and produces mixed content. Instead the caller logs out
  // and opens the login form for the restored server, the only path that
  // cleanly resets both for the new server and the one that makes whoever
  // restores the file prove they know the password.
  await useServersBase.persist.rehydrate();
  await useAppBase.persist.rehydrate();
  await usePodcasts.persist.rehydrate();
  await useMusicFolders.persist.rehydrate();

  const target = readRestoredAuthTarget(backup);
  if (!target) return { serverId: null, username: null };
  const servers = useServersBase.getState();
  // A v2 backup's auth blob names the server directly; a v1's predates
  // `serverId` and can only be resolved by the URL it was signed in with.
  const server = target.serverId
    ? servers.getServerById(target.serverId)
    : servers.getServerByUrl(target.url);
  return { serverId: server?.id ?? null, username: target.username || null };
}

// Reads the restored (server, user) from the backup's persisted auth blob
// without touching the live auth store. The persisted shape is zustand's
// `{ state, version }` wrapper. Only the identity counts: files written since
// secrets were stripped never mark the session signed in.
function readRestoredAuthTarget(
  backup: BackupFile,
): { serverId?: string; url: string; username: string } | null {
  const raw = backup.global.auth;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: {
        serverId?: string;
        url?: string;
        username?: string;
      };
    };
    const state = parsed?.state;
    if (!state?.url) return null;
    return {
      serverId: state.serverId || undefined,
      url: state.url,
      username: state.username ?? "",
    };
  } catch {
    return null;
  }
}
