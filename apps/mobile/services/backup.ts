import * as Application from "expo-application";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import Share from "react-native-share";
import * as z from "zod";
import { getAuthScope, LOCAL_AUTH_SCOPE } from "@/config/authScope";
import { storage } from "@/config/storage";
import {
  BACKUP_EXCLUDED_SCOPED_STORE_NAMES,
  GLOBAL_KEYS,
  SCOPED_STORE_NAMES,
} from "@/services/backupStoreKeys";
import {
  buildScopeRemap,
  remapOfflineTrackPaths,
} from "@/services/storageScopeMigration";
import { useAppBase } from "@/stores/app";
import useMusicFolders from "@/stores/musicFolders";
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

const isBackupExcluded = (storeName: string) =>
  BACKUP_EXCLUDED_SCOPED_STORE_NAMES.some((excluded) =>
    storeName.startsWith(excluded),
  );

function collectScopes(): string[] {
  const { servers, users } = useServersBase.getState();
  const serverById = new Map(servers.map((s) => [s.id, s] as const));
  const scopes = new Set<string>();
  for (const user of users) {
    const server = serverById.get(user.serverId);
    if (!server) continue;
    scopes.add(
      server.type === "local"
        ? LOCAL_AUTH_SCOPE
        : getAuthScope(server.id, user.username),
    );
  }
  // Also recover scopes directly from storage so data for users missing from
  // the `users` list (legacy state, removed users) is still backed up. A scoped
  // key is `<scope>:<storeName>`, and scopes never contain ":" (getAuthScope
  // replaces non-alphanumerics with "_"), so the scope is the slice before the
  // first matching store-name marker.
  for (const key of storage.getAllKeys()) {
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

// Secrets never travel in a backup file: the export goes out through the OS
// share sheet (cloud drives, chat apps, email), and restore routes through the
// re-login flow anyway — readRestoredAuthTarget only needs the identity fields.
// The active session's password/tokens are blanked and the opt-in saved
// passwords are dropped from the servers blob. Fails closed: a blob that can't
// be parsed is omitted rather than exported unsanitized.
function sanitizeGlobalForBackup(
  key: string,
  value: string,
): string | undefined {
  if (key !== "auth" && key !== "servers") return value;
  try {
    const parsed = JSON.parse(value) as { state?: Record<string, unknown> };
    if (!parsed?.state || typeof parsed.state !== "object") return undefined;
    if (key === "auth") {
      parsed.state = {
        ...parsed.state,
        password: "",
        token: null,
        subsonicSalt: null,
        subsonicToken: null,
        jellyfinAccessToken: null,
      };
    } else {
      const users = parsed.state.users;
      if (Array.isArray(users)) {
        parsed.state = {
          ...parsed.state,
          users: users.map((user) => {
            if (user && typeof user === "object") {
              const { password: _password, ...rest } = user as Record<
                string,
                unknown
              >;
              return rest;
            }
            return user;
          }),
        };
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return undefined;
  }
}

export function buildBackup(): BackupFile {
  const global: Record<string, string> = {};
  for (const key of GLOBAL_KEYS) {
    const value = storage.getString(key);
    if (value === undefined) continue;
    const sanitized = sanitizeGlobalForBackup(key, value);
    if (sanitized !== undefined) global[key] = sanitized;
  }

  const allKeys = storage.getAllKeys();
  const scoped = collectScopes().map((scope) => {
    const prefix = `${scope}:`;
    const values: Record<string, string> = {};
    for (const key of allKeys) {
      if (!key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (isBackupExcluded(name)) continue;
      const value = storage.getString(key);
      if (value !== undefined) values[name] = value;
    }
    return { scope, values };
  });

  return {
    version: BACKUP_VERSION,
    appVersion: Application.nativeApplicationVersion ?? "unknown",
    exportedAt: new Date().toISOString(),
    global,
    scoped,
  };
}

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function exportBackup(): Promise<void> {
  const backup = buildBackup();
  const fileName = `wavio-backup-${timestampSlug()}.json`;
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup, null, 2));

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
    storage.set(key, value);
  }
  for (const { scope, values } of scoped) {
    for (const [key, value] of Object.entries(values)) {
      if (isBackupExcluded(key)) continue;
      storage.set(`${scope}:${key}`, value);
    }
  }

  // Bring the global, account-independent stores into memory so the restored
  // server list and app settings take effect immediately and can't be
  // re-persisted over by stale pre-restore state. The auth store is
  // deliberately NOT rehydrated here: doing so would hot-swap the active
  // account in place (isAuthenticated stays true while the server changes),
  // which leaves React Query and the scoped-store hydration guard pointing at
  // the previous server and produces mixed content. Instead the caller routes
  // through the logout → re-login flow (switchToServer), the only path that
  // cleanly resets both for the new server.
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
// `{ state, version }` wrapper.
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
        isAuthenticated?: boolean;
      };
    };
    const state = parsed?.state;
    if (!state?.isAuthenticated || !state.url) return null;
    return {
      serverId: state.serverId || undefined,
      url: state.url,
      username: state.username ?? "",
    };
  } catch {
    return null;
  }
}
