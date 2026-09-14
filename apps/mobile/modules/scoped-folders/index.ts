import { requireOptionalNativeModule } from "expo";

/** A folder the process currently holds security-scoped access to. */
export type ScopedFolder = {
  /** `file://` URL of the folder, valid for this process only. */
  uri: string;
  /** Opaque base64 token that re-opens access in a later launch. */
  bookmark: string;
  /** Last path component, for display. */
  name: string;
};

export type ResolvedScopedFolder = ScopedFolder & {
  /** The stored bookmark had to be refreshed; persist the new one. */
  stale: boolean;
};

type ScopedFoldersNativeModule = {
  applicationSupportDirectory: string;
  pickFolder(): Promise<ScopedFolder | null>;
  resolveFolder(bookmark: string): Promise<ResolvedScopedFolder | null>;
};

// Autolinked from `modules/scoped-folders`, iOS only: Android folders are SAF
// tree URIs whose grant the system persists itself. Optional so importing this
// file never throws there, or before a native rebuild.
const Native =
  requireOptionalNativeModule<ScopedFoldersNativeModule>("ScopedFolders");

export const isScopedFoldersAvailable = (): boolean => Native != null;

/**
 * `file://` URL of `Library/Application Support`, or null off iOS. Where app
 * data lives once Documents is exposed in the Files app.
 */
export const applicationSupportDirectory = (): string | null =>
  Native?.applicationSupportDirectory ?? null;

/** Presents the Files folder picker. Resolves null when the user cancels. */
export async function pickScopedFolder(): Promise<ScopedFolder | null> {
  if (!Native) return null;
  return Native.pickFolder();
}

/**
 * Re-opens access to a folder from a stored bookmark. Null means the folder is
 * gone (deleted, or its provider removed) and the bookmark should be dropped.
 */
export async function resolveScopedFolder(
  bookmark: string,
): Promise<ResolvedScopedFolder | null> {
  if (!Native) return null;
  return Native.resolveFolder(bookmark);
}
