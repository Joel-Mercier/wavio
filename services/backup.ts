import * as Application from "expo-application";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import Share from "react-native-share";
import * as z from "zod";
import { getAuthScope, storage } from "@/config/storage";
import useServers from "@/stores/servers";

const GLOBAL_KEYS = [
  "auth",
  "servers",
  "app",
  "offlineStore",
  "podcasts",
  "musicFolders",
] as const;

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
  const { servers, users } = useServers.getState();
  const serverById = new Map(servers.map((s) => [s.id, s] as const));
  const scopes = new Set<string>();
  for (const user of users) {
    const server = serverById.get(user.serverId);
    if (!server) continue;
    scopes.add(getAuthScope(server.url, user.username));
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

export function restoreBackup(backup: BackupFile): void {
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
}
