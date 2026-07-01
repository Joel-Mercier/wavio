import * as Application from "expo-application";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import Share from "react-native-share";
import * as z from "zod";
import { getAuthScope, storage } from "@/config/storage";
import { GLOBAL_KEYS, SCOPED_STORE_NAMES } from "@/services/backupStoreKeys";
import { useAppBase } from "@/stores/app";
import useMusicFolders from "@/stores/musicFolders";
import usePodcasts from "@/stores/podcasts";
import { useServersBase } from "@/stores/servers";

const backupSchema = z.object({
  version: z.literal(1),
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

export type BackupFile = z.infer<typeof backupSchema>;

function collectScopes(): string[] {
  const { servers, users } = useServersBase.getState();
  const serverById = new Map(servers.map((s) => [s.id, s] as const));
  const scopes = new Set<string>();
  for (const user of users) {
    const server = serverById.get(user.serverId);
    if (!server) continue;
    scopes.add(getAuthScope(server.url, user.username));
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

export function buildBackup(): BackupFile {
  const global: Record<string, string> = {};
  for (const key of GLOBAL_KEYS) {
    const value = storage.getString(key);
    if (value !== undefined) global[key] = value;
  }

  const allKeys = storage.getAllKeys();
  const scoped = collectScopes().map((scope) => {
    const prefix = `${scope}:`;
    const values: Record<string, string> = {};
    for (const key of allKeys) {
      if (!key.startsWith(prefix)) continue;
      const value = storage.getString(key);
      if (value !== undefined) values[key.slice(prefix.length)] = value;
    }
    return { scope, values };
  });

  return {
    version: 1,
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

export async function restoreBackup(
  backup: BackupFile,
): Promise<RestoreOutcome> {
  const scopes = backup.scoped.map((s) => s.scope);
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
  for (const { scope, values } of backup.scoped) {
    for (const [key, value] of Object.entries(values)) {
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
  const server = useServersBase.getState().getServerByUrl(target.url);
  return { serverId: server?.id ?? null, username: target.username || null };
}

// Reads the restored (server, user) from the backup's persisted auth blob
// without touching the live auth store. The persisted shape is zustand's
// `{ state, version }` wrapper.
function readRestoredAuthTarget(
  backup: BackupFile,
): { url: string; username: string } | null {
  const raw = backup.global.auth;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { url?: string; username?: string; isAuthenticated?: boolean };
    };
    const state = parsed?.state;
    if (!state?.isAuthenticated || !state.url) return null;
    return { url: state.url, username: state.username ?? "" };
  } catch {
    return null;
  }
}
