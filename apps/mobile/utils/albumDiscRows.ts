import type { Child, DiscTitle } from "@/services/openSubsonic/types";

export type AlbumListRow =
  | { kind: "disc"; key: string; disc: number; title?: string }
  | { kind: "track"; key: string; track: Child; trackIndex: number };

/**
 * Flattens an album's tracks into FlashList rows, inserting a disc-header row
 * before each disc group when the album spans more than one disc. `trackIndex`
 * is the position within the original `songs` array so playback keeps indexing
 * the unflattened track list. Disc grouping relies on the server returning
 * tracks already ordered by disc then track (Subsonic/Jellyfin both do).
 */
export function buildAlbumListRows(
  songs: Child[] | undefined,
  discTitles?: DiscTitle[],
): { rows: AlbumListRow[]; isMultiDisc: boolean } {
  if (!songs || songs.length === 0) {
    return { rows: [], isMultiDisc: false };
  }
  const isMultiDisc = new Set(songs.map((s) => s.discNumber ?? 1)).size > 1;
  if (!isMultiDisc) {
    return {
      rows: songs.map((track, trackIndex) => ({
        kind: "track",
        key: track.id,
        track,
        trackIndex,
      })),
      isMultiDisc: false,
    };
  }
  const titleByDisc = new Map(
    (discTitles ?? []).map((dt) => [dt.disc, dt.title]),
  );
  const rows: AlbumListRow[] = [];
  let currentDisc: number | undefined;
  songs.forEach((track, trackIndex) => {
    const disc = track.discNumber ?? 1;
    if (disc !== currentDisc) {
      currentDisc = disc;
      rows.push({
        kind: "disc",
        key: `disc-${disc}`,
        disc,
        title: titleByDisc.get(disc),
      });
    }
    rows.push({ kind: "track", key: track.id, track, trackIndex });
  });
  return { rows, isMultiDisc: true };
}
