import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import i18n from "@/config/i18n";
import {
  isScopedFoldersAvailable,
  pickScopedFolder,
  resolveScopedFolder,
} from "@/modules/scoped-folders";
import useScopedFolders from "@/stores/scopedFolders";
import useServers from "@/stores/servers";
import { logError } from "@/utils/log";
import {
  hasResolvedRoot,
  localFolderRoot,
  MUSIC_ROOT_ID,
  musicRoot,
  parseLocalFolderUri,
  registerRootsRestorer,
  resolvedRootIdFor,
  setResolvedRoot,
} from "./localFolderUris";

// The iOS roots of the on-device library: which ones exist, re-opening them at
// launch, and adding one through the Files picker. The addressing scheme they
// hide behind is in ./localFolderUris.ts.
//
// Two kinds of root:
//   - `music`: `Documents/Music`, which the Files app shows as
//     "On My iPhone › <app name> › Music" (app.json enables file sharing).
//     Always present, never removable, needs no bookmark.
//   - a UUID: a folder the user picked from Files (iCloud Drive, another app's
//     container, a share mounted in Files). Its bookmark lives in
//     stores/scopedFolders.ts and is re-opened by `restoreLocalFolders`.
//
// Files a provider hasn't downloaded yet (iCloud Drive's `.icloud`
// placeholders) carry no audio extension, so the scan skips them until the
// user downloads them in Files.

const MUSIC_DIRECTORY_NAME = "Music";

/** Whether this platform addresses the local library through folder roots. */
export const usesLocalFolderRoots = (): boolean => Platform.OS === "ios";

/**
 * The folder list a local server must carry on this platform: on iOS the Music
 * root always comes first and can't be dropped, elsewhere the list is the
 * user's alone. Applied to form defaults and on save so both agree.
 */
export function withRequiredRoots(paths: string[]): string[] {
  if (!usesLocalFolderRoots()) return paths;
  return [musicRoot(), ...paths.filter((path) => path !== musicRoot())];
}

// The Files app names the container after the device model and the installed
// app — "Wavio Dev" on a development build, "On My iPad" on a tablet — so the
// path shown to the user is built from both rather than spelled out.
export const musicRootLabelParams = (): { device: string; app: string } => ({
  device: Platform.OS === "ios" && Platform.isPad ? "iPad" : "iPhone",
  app: Application.applicationName ?? "Wavio",
});

/** Display name for a root or any URI under it. */
export function localFolderLabel(uri: string): string {
  const parsed = parseLocalFolderUri(uri);
  if (!parsed) return uri;
  if (parsed.rootId === MUSIC_ROOT_ID) {
    return i18n.t("auth.login.localMusicFolder", musicRootLabelParams());
  }
  return useScopedFolders.getState().folders[parsed.rootId]?.label ?? uri;
}

/**
 * Readable path for a file under a root: the root's label followed by the
 * file's path within it. Anything that isn't a root address is returned as is.
 */
export function localFolderPathLabel(uri: string): string {
  const parsed = parseLocalFolderUri(uri);
  if (!parsed) return uri;
  const root = localFolderLabel(localFolderRoot(parsed.rootId));
  if (!parsed.relative) return root;
  let relative = parsed.relative;
  try {
    relative = decodeURIComponent(relative);
  } catch {}
  return `${root}/${relative}`;
}

let restoring: Promise<void> | null = null;

/**
 * Re-open access to every configured root. Idempotent; the app layout kicks it
 * off at startup, and the device source waits on it before touching a
 * `local-folder://` address so a cold-start scan or play can't race it.
 *
 * Off iOS this is a no-op: Android roots need no resolving.
 */
export function restoreLocalFolders(): Promise<void> {
  if (!usesLocalFolderRoots()) return Promise.resolve();
  if (!restoring) restoring = restore();
  return restoring;
}

registerRootsRestorer(restoreLocalFolders);

/**
 * Run the restore pass again over the current store contents — after a backup
 * restore has swapped the bookmarks under it — so the roots it brought in
 * resolve now rather than on the next launch.
 */
export function reloadLocalFolders(): Promise<void> {
  if (!usesLocalFolderRoots()) return Promise.resolve();
  restoring = restore();
  return restoring;
}

async function restore(): Promise<void> {
  const music = new Directory(Paths.document, MUSIC_DIRECTORY_NAME);
  try {
    music.create({ idempotent: true, intermediates: true });
  } catch (error) {
    logError("[localFolders] Failed to create the Music folder", error);
  }
  setResolvedRoot(MUSIC_ROOT_ID, music.uri);

  if (!isScopedFoldersAvailable()) return;
  const store = useScopedFolders.getState();
  const configured = configuredRootIds();
  for (const [rootId, entry] of Object.entries(store.folders)) {
    // A folder dropped from the server form keeps its bookmark until here, so
    // cancelling the form never loses a grant; anything no server references
    // by now really was removed. A root resolved in this process was picked
    // moments ago and is about to be saved, so it's spared.
    if (!configured.has(rootId) && !hasResolvedRoot(rootId)) {
      store.removeFolder(rootId);
      continue;
    }
    try {
      const folder = await resolveScopedFolder(entry.bookmark);
      if (!folder) continue;
      setResolvedRoot(rootId, folder.uri);
      if (folder.stale) store.setBookmark(rootId, folder.bookmark);
    } catch (error) {
      logError(`[localFolders] Failed to restore folder ${rootId}`, error);
    }
  }
}

function configuredRootIds(): Set<string> {
  const ids = new Set<string>();
  for (const server of useServers.getState().servers) {
    for (const path of server.paths ?? []) {
      const parsed = parseLocalFolderUri(path);
      if (parsed) ids.add(parsed.rootId);
    }
  }
  return ids;
}

/**
 * Present the Files folder picker and register the choice. Resolves the root's
 * canonical URI, or null when the user cancelled. Picking a folder that is
 * already a root keeps its id — a second id for the same directory would index
 * every track under it twice — and just refreshes its bookmark and label.
 */
export async function addPickedFolder(): Promise<string | null> {
  const folder = await pickScopedFolder();
  if (!folder) return null;
  const rootId = resolvedRootIdFor(folder.uri) ?? Crypto.randomUUID();
  useScopedFolders
    .getState()
    .setFolder(rootId, { bookmark: folder.bookmark, label: folder.name });
  setResolvedRoot(rootId, folder.uri);
  return localFolderRoot(rootId);
}

/** Test seam. */
export function __resetLocalFolders(): void {
  restoring = null;
}
