import {
  audiobookCoverUrl,
  audiobookTrackId,
} from "@/services/audiobookshelf/keys";
import type {
  AbsAudioTrack,
  AbsLibraryItem,
} from "@/services/audiobookshelf/types";
import type { AudiobookSnapshot } from "@/stores/audiobookProgress";
import type { QueueTrack } from "@/stores/queue";

export function absAuthorName(item: AbsLibraryItem): string {
  const metadata = item.media.metadata;
  return (
    metadata.authorName ||
    metadata.authors?.map((author) => author.name).join(", ") ||
    ""
  );
}

export function absNarratorName(item: AbsLibraryItem): string {
  const metadata = item.media.metadata;
  return metadata.narratorName || metadata.narrators?.join(", ") || "";
}

export function absTitle(item: AbsLibraryItem): string {
  return item.media.metadata.title || "";
}

export function snapshotFromItem(
  item: AbsLibraryItem,
): AudiobookSnapshot | null {
  const tracks: AbsAudioTrack[] = item.media.tracks ?? [];
  if (tracks.length === 0) return null;
  const files = [...tracks]
    .sort((a, b) => a.startOffset - b.startOffset)
    .filter((track) => !!track.ino)
    .map((track) => ({
      index: track.index,
      ino: track.ino as string,
      startOffset: track.startOffset,
      duration: track.duration,
      mimeType: track.mimeType,
      ext: (track.metadata?.ext ?? "").replace(/^\./, "") || "mp3",
      size: track.metadata?.size ?? 0,
    }));
  if (files.length === 0) return null;
  const last = files[files.length - 1];
  return {
    itemId: item.id,
    libraryId: item.libraryId,
    title: absTitle(item),
    author: absAuthorName(item),
    narrator: absNarratorName(item) || undefined,
    hasCover: !!item.media.coverPath,
    duration: item.media.duration || last.startOffset + last.duration,
    chapters: (item.media.chapters ?? []).map(({ start, end, title }) => ({
      start,
      end,
      title,
    })),
    files,
    savedAt: Date.now(),
  };
}

// One queue entry per audio file. Book-level data (chapters, the other files)
// stays in the snapshot rather than on every entry, which the queue would
// otherwise persist once per file.
export function audiobookToTracks(
  book: AudiobookSnapshot,
  serverUrl: string,
): QueueTrack[] {
  const artwork =
    serverUrl && book.hasCover !== false
      ? audiobookCoverUrl(serverUrl, book.itemId)
      : undefined;
  const multiFile = book.files.length > 1;
  return book.files.map((file, position) => ({
    id: audiobookTrackId(book.itemId, file.ino),
    url: "",
    title: multiFile
      ? `${book.title} (${position + 1}/${book.files.length})`
      : book.title,
    artist: book.author,
    album: book.title,
    artwork,
    duration: file.duration,
    source: "audiobook",
    audiobookItemId: book.itemId,
    audiobookIno: file.ino,
    audiobookFileIndex: file.index,
    bookStartOffset: file.startOffset,
    bookDuration: book.duration,
    contentType: file.mimeType,
    suffix: file.ext,
  }));
}
