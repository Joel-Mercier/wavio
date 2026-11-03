// An audiobook is one timeline split across one or more audio files, with
// chapters laid over the whole of it — a chapter may start in one file and end
// in the next. The queue holds one entry per file, so everything that speaks in
// book time (server progress, chapters) goes through these conversions.

export interface AudiobookFileSpan {
  startOffset: number;
  duration: number;
}

export interface AudiobookChapterSpan {
  start: number;
  end: number;
  title: string;
}

// Below this a position counts as the start of the file, so finishing one file
// and loading the next doesn't resume a fraction of a second in.
const START_SLACK_SECONDS = 2;

export function bookDuration(files: readonly AudiobookFileSpan[]): number {
  const last = files[files.length - 1];
  return last ? last.startOffset + last.duration : 0;
}

/** Which file holds `bookTime`, and how far into it. */
export function locateInBook(
  files: readonly AudiobookFileSpan[],
  bookTime: number,
): { fileIndex: number; offset: number } {
  if (files.length === 0) return { fileIndex: 0, offset: 0 };
  const time = Math.max(0, bookTime);
  for (let i = files.length - 1; i >= 0; i -= 1) {
    if (time >= files[i].startOffset) {
      const offset = Math.min(time - files[i].startOffset, files[i].duration);
      return { fileIndex: i, offset };
    }
  }
  return { fileIndex: 0, offset: 0 };
}

export function toBookTime(
  file: AudiobookFileSpan,
  positionInFile: number,
): number {
  return file.startOffset + Math.max(0, positionInFile);
}

/**
 * Where a file should start when it loads, given the book's saved position:
 * inside the file when the position falls within it, otherwise its start (a
 * manual jump to another file, or the next file after one finished).
 */
export function resumeOffsetInFile(
  file: AudiobookFileSpan,
  bookTime: number | null | undefined,
): number | null {
  if (bookTime == null) return null;
  const offset = bookTime - file.startOffset;
  if (offset < START_SLACK_SECONDS || offset >= file.duration - 1) return null;
  return offset;
}

// A seek to a chapter's start can land a hair short of it (the engine reports
// whole milliseconds, a compressed stream lands on a frame), so a position this
// close before a start already counts as that chapter.
const CHAPTER_BOUNDARY_SLACK_SECONDS = 0.25;

export function chapterIndexAt(
  chapters: readonly AudiobookChapterSpan[],
  bookTime: number,
): number {
  if (chapters.length === 0) return -1;
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    if (bookTime + CHAPTER_BOUNDARY_SLACK_SECONDS >= chapters[i].start)
      return i;
  }
  return 0;
}

/**
 * Book time the chapter playing at `bookTime` ends at (the next one's end in a
 * gap between two, `bookDuration` past the last), or null without chapters.
 */
export function chapterEndAt(
  chapters: readonly AudiobookChapterSpan[],
  bookTime: number,
  bookDuration: number,
): number | null {
  if (chapters.length === 0) return null;
  return (
    chapters.find(
      (chapter) => chapter.end > bookTime + CHAPTER_BOUNDARY_SLACK_SECONDS,
    )?.end ??
    (bookDuration || null)
  );
}

/** Book time of the next chapter's start, or null on the last one. */
export function nextChapterStart(
  chapters: readonly AudiobookChapterSpan[],
  bookTime: number,
): number | null {
  const index = chapterIndexAt(chapters, bookTime);
  if (index < 0 || index >= chapters.length - 1) return null;
  return chapters[index + 1].start;
}

// The usual player rule: a press a few seconds into a chapter restarts it,
// a press at its very start goes to the one before.
const RESTART_CHAPTER_AFTER_SECONDS = 3;

export function previousChapterStart(
  chapters: readonly AudiobookChapterSpan[],
  bookTime: number,
): number {
  const index = chapterIndexAt(chapters, bookTime);
  if (index < 0) return 0;
  const current = chapters[index];
  if (bookTime - current.start > RESTART_CHAPTER_AFTER_SECONDS || index === 0) {
    return current.start;
  }
  return chapters[index - 1].start;
}

/** Seconds left until the chapter holding `bookTime` ends. */
export function remainingInChapter(
  chapters: readonly AudiobookChapterSpan[],
  bookTime: number,
): number | null {
  const index = chapterIndexAt(chapters, bookTime);
  if (index < 0) return null;
  return Math.max(0, chapters[index].end - bookTime);
}
