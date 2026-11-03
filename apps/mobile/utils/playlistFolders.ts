// Playlist folders (issue #224). No backend models them, so a folder is either
// created in Wavio (a record in the scoped playlists store) or detected from a
// "<folder><separator><title>" playlist name, and the two meet on the
// normalized folder name: a local "Rock" and playlists named "rock - …" are one
// folder.

export const DEFAULT_PLAYLIST_FOLDER_SEPARATOR = " - ";

export const PLAYLIST_FOLDER_SEPARATOR_PRESETS = [
  " - ",
  " / ",
  " | ",
  " > ",
] as const;

export const PLAYLIST_FOLDER_COLORS = [
  "emerald",
  "blue",
  "violet",
  "pink",
  "red",
  "orange",
  "amber",
  "teal",
] as const;

export type PlaylistFolderColor = (typeof PLAYLIST_FOLDER_COLORS)[number];

export type PlaylistFolderRecord = {
  name: string;
  color: PlaylistFolderColor | null;
  createdAt: number;
  // Keys this folder was renamed from, so playlists detected under an old
  // name keep landing here, with that prefix stripped.
  renamedFrom?: string[];
};

// Per playlist id: a folder key moves it into that folder, null keeps it at
// the root even when its name would be detected into one.
export type PlaylistFolderAssignments = Record<string, string | null>;

export type PlaylistFolderOptions = {
  detect: boolean;
  separator: string;
  folders: Record<string, PlaylistFolderRecord>;
  assignments: PlaylistFolderAssignments;
};

type GroupablePlaylist = {
  id: string;
  name: string;
  created?: string | Date;
  songCount?: number;
  duration?: number;
};

export type PlaylistFolderMember<T> = { playlist: T; title: string };

export type PlaylistFolderGroup<T> = {
  key: string;
  name: string;
  color: PlaylistFolderColor | null;
  createdAt?: number;
  members: PlaylistFolderMember<T>[];
};

export type LibraryPlaylistFolderRow = {
  id: string;
  name: string;
  isPlaylistFolder: true;
  folderKey: string;
  folderColor: PlaylistFolderColor | null;
  playlistCount: number;
  created?: string;
  songCount?: number;
  duration?: number;
};

export const folderKey = (name: string) => name.trim().toLowerCase();

// Spelled out in full: Tailwind only emits the colors it finds as literal
// classes, and most of these are used nowhere else in the app.
export const PLAYLIST_FOLDER_COLOR_CLASSES: Record<
  PlaylistFolderColor,
  string
> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  teal: "bg-teal-500",
};

export function splitPlaylistName(
  name: string,
  separator: string,
): { folder: string; title: string } | null {
  if (!separator) return null;
  const index = name.indexOf(separator);
  if (index === -1) return null;
  const folder = name.slice(0, index).trim();
  const title = name.slice(index + separator.length).trim();
  if (!folder || !title) return null;
  return { folder, title };
}

function renamedFolderKeys(folders: PlaylistFolderOptions["folders"]) {
  const renamed = new Map<string, string>();
  for (const [key, record] of Object.entries(folders)) {
    for (const from of record.renamedFrom ?? []) {
      if (!folders[from]) renamed.set(from, key);
    }
  }
  return renamed;
}

function resolvePlaylistFolder(
  playlist: GroupablePlaylist,
  options: PlaylistFolderOptions,
  renamed: Map<string, string>,
): { key: string; title: string; detectedName?: string } | null {
  const detected = options.detect
    ? splitPlaylistName(playlist.name, options.separator)
    : null;
  const nameKey = detected ? folderKey(detected.folder) : null;
  const detectedKey = nameKey ? (renamed.get(nameKey) ?? nameKey) : null;
  if (playlist.id in options.assignments) {
    const assigned = options.assignments[playlist.id];
    if (assigned === null) return null;
    // A folder deleted while this playlist wasn't listed leaves its assignment
    // behind; fall back to detection rather than conjure a nameless folder.
    if (options.folders[assigned]) {
      return {
        key: assigned,
        title:
          detected && assigned === detectedKey ? detected.title : playlist.name,
      };
    }
  }
  if (detected && detectedKey) {
    return {
      key: detectedKey,
      title: detected.title,
      detectedName: detected.folder,
    };
  }
  return null;
}

export function groupPlaylistsIntoFolders<T extends GroupablePlaylist>(
  playlists: T[],
  options: PlaylistFolderOptions,
): { rootPlaylists: T[]; folders: PlaylistFolderGroup<T>[] } {
  const rootPlaylists: T[] = [];
  const groups = new Map<string, PlaylistFolderGroup<T>>();
  for (const [key, record] of Object.entries(options.folders)) {
    groups.set(key, {
      key,
      name: record.name,
      color: record.color,
      createdAt: record.createdAt,
      members: [],
    });
  }
  const renamed = renamedFolderKeys(options.folders);
  for (const playlist of playlists) {
    const resolved = resolvePlaylistFolder(playlist, options, renamed);
    if (!resolved) {
      rootPlaylists.push(playlist);
      continue;
    }
    let group = groups.get(resolved.key);
    if (!group) {
      group = {
        key: resolved.key,
        name: resolved.detectedName ?? resolved.title,
        color: null,
        members: [],
      };
      groups.set(resolved.key, group);
    }
    group.members.push({ playlist, title: resolved.title });
  }
  return { rootPlaylists, folders: [...groups.values()] };
}

// Undefined when no member reports the field (an offline download carries no
// duration), so the folder sorts as "no data" rather than as an empty one.
function sumOf<T extends GroupablePlaylist>(
  members: PlaylistFolderMember<T>[],
  field: "songCount" | "duration",
): number | undefined {
  let total: number | undefined;
  for (const { playlist } of members) {
    const value = playlist[field];
    if (typeof value === "number") total = (total ?? 0) + value;
  }
  return total;
}

export function playlistFolderRow<T extends GroupablePlaylist>(
  group: PlaylistFolderGroup<T>,
): LibraryPlaylistFolderRow {
  let created: number | undefined = group.createdAt;
  if (created === undefined) {
    for (const { playlist } of group.members) {
      const time = playlist.created
        ? new Date(playlist.created).getTime()
        : Number.NaN;
      if (!Number.isNaN(time) && (created === undefined || time > created)) {
        created = time;
      }
    }
  }
  return {
    id: `playlist-folder:${group.key}`,
    name: group.name,
    isPlaylistFolder: true,
    folderKey: group.key,
    folderColor: group.color,
    playlistCount: group.members.length,
    created:
      created === undefined ? undefined : new Date(created).toISOString(),
    songCount: sumOf(group.members, "songCount"),
    duration: sumOf(group.members, "duration"),
  };
}

// The assignment that puts `playlist` in `targetKey` (or at the root for
// null). Moving into a folder always pins it, so the folder keeps its contents
// if detection is later turned off or the separator changes. Moving out pins
// the root only for a name that splits, since only those can be detected back
// in; anything else just loses its assignment.
export function folderAssignmentFor(
  playlist: GroupablePlaylist,
  targetKey: string | null,
  separator: string,
): string | null | undefined {
  if (targetKey !== null) return targetKey;
  return splitPlaylistName(playlist.name, separator) ? null : undefined;
}
