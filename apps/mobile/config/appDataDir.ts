import { Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { applicationSupportDirectory } from "@/modules/scoped-folders";

// Where the app keeps its own durable data: the local-library SQLite index,
// offline downloads, mirrored artwork, and the MMKV store behind every zustand
// store.
//
// Android: `Paths.document` (the app's private files dir), as it always was.
//
// iOS: `Library/Application Support`. Documents is exposed in the Files app
// (`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` in app.json) so
// the user can drop music into it, and everything that lives there is visible
// and deletable — the MMKV files under `Documents/mmkv/` hold server credentials.
// Both directories are backed up and persist across updates alike; only the
// visibility differs. Falls back to Documents if the native module isn't linked
// (a stale native build), so the app still starts.
//
// Resolved lazily rather than at import time so test files can mock
// expo-file-system without also stubbing this module.
let cached: Directory | null = null;

export function appDataDir(): Directory {
  if (cached) return cached;
  const support = Platform.OS === "ios" ? applicationSupportDirectory() : null;
  const dir = support ? new Directory(support) : Paths.document;
  if (support) dir.create({ idempotent: true, intermediates: true });
  cached = dir;
  return dir;
}

// Plain filesystem path (no `file://`), for the APIs that take one: MMKV's
// `path` and expo-sqlite's `directory`.
export function appDataPath(): string {
  return decodeURIComponent(appDataDir().uri.replace(/^file:\/\//, "")).replace(
    /\/$/,
    "",
  );
}

// Mirrors expo-sqlite's own default (`<documents>/SQLite`) under the app-data
// directory. Shared by services/local/db.ts (which opens the databases there)
// and services/storageScopeMigration.ts (which renames them) so the two can't
// drift apart.
export const SQLITE_DIRECTORY_NAME = "SQLite";

// The form expo-sqlite's `directory` option needs differs per platform. iOS
// parses it with `URL(string:)` and only decodes back to a filesystem path when
// the string is a `file://` URL: a plain path with a space (`Application
// Support`) gets percent-encoded instead, and the databases land in a literal
// `Application%20Support` sibling that migrateLocalLibraryDatabases never looks
// in (on iOS 15/16 the open fails outright). Android wraps it in `File()`, which
// wants the plain path.
export const localLibraryDatabaseDirectory = (): string =>
  Platform.OS === "ios"
    ? new Directory(appDataDir(), SQLITE_DIRECTORY_NAME).uri.replace(/\/$/, "")
    : `${appDataPath()}/${SQLITE_DIRECTORY_NAME}`;
