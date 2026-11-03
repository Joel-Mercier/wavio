import {
  bookDuration,
  chapterEndAt,
  chapterIndexAt,
  locateInBook,
  nextChapterStart,
  previousChapterStart,
  remainingInChapter,
  resumeOffsetInFile,
  toBookTime,
} from "@/utils/audiobookTimeline";

// Three files of 100 s each, with chapters that straddle the file boundaries:
// a book's chapters are laid over its whole timeline, not over its files.
const files = [
  { startOffset: 0, duration: 100 },
  { startOffset: 100, duration: 100 },
  { startOffset: 200, duration: 100 },
];
const chapters = [
  { start: 0, end: 150, title: "One" },
  { start: 150, end: 250, title: "Two" },
  { start: 250, end: 300, title: "Three" },
];

describe("locateInBook", () => {
  it("finds the file holding a book position", () => {
    expect(locateInBook(files, 0)).toEqual({ fileIndex: 0, offset: 0 });
    expect(locateInBook(files, 150)).toEqual({ fileIndex: 1, offset: 50 });
    expect(locateInBook(files, 200)).toEqual({ fileIndex: 2, offset: 0 });
  });

  it("clamps past the end of the book to the end of the last file", () => {
    expect(locateInBook(files, 1000)).toEqual({ fileIndex: 2, offset: 100 });
  });

  it("clamps negative positions to the start", () => {
    expect(locateInBook(files, -5)).toEqual({ fileIndex: 0, offset: 0 });
  });

  it("round-trips through toBookTime", () => {
    const { fileIndex, offset } = locateInBook(files, 237);
    expect(toBookTime(files[fileIndex], offset)).toBe(237);
  });

  it("measures the whole book", () => {
    expect(bookDuration(files)).toBe(300);
    expect(bookDuration([])).toBe(0);
  });
});

describe("resumeOffsetInFile", () => {
  it("resumes inside the file holding the saved position", () => {
    expect(resumeOffsetInFile(files[1], 150)).toBe(50);
  });

  it("starts other files from their top", () => {
    expect(resumeOffsetInFile(files[0], 150)).toBeNull();
    expect(resumeOffsetInFile(files[2], 150)).toBeNull();
  });

  // Finishing file 0 saves 100 s, which is the very start of file 1: loading
  // it must not seek a fraction of a second in.
  it("treats the first couple of seconds as the start", () => {
    expect(resumeOffsetInFile(files[1], 100)).toBeNull();
    expect(resumeOffsetInFile(files[1], 101)).toBeNull();
  });

  it("does not resume at the very end of a file", () => {
    expect(resumeOffsetInFile(files[1], 199.5)).toBeNull();
  });

  it("has nothing to resume without a saved position", () => {
    expect(resumeOffsetInFile(files[0], null)).toBeNull();
  });
});

describe("chapters", () => {
  it("finds the chapter at a position, across file boundaries", () => {
    expect(chapterIndexAt(chapters, 120)).toBe(0);
    expect(chapterIndexAt(chapters, 150)).toBe(1);
    expect(chapterIndexAt(chapters, 299)).toBe(2);
    expect(chapterIndexAt([], 10)).toBe(-1);
  });

  it("skips to the next chapter, and nowhere from the last", () => {
    expect(nextChapterStart(chapters, 10)).toBe(150);
    expect(nextChapterStart(chapters, 260)).toBeNull();
  });

  it("restarts the chapter a few seconds in, else goes to the previous one", () => {
    expect(previousChapterStart(chapters, 200)).toBe(150);
    expect(previousChapterStart(chapters, 151)).toBe(0);
    expect(previousChapterStart(chapters, 1)).toBe(0);
  });

  // A skip to 2981.015828 is reported back as 2981.015 (whole milliseconds).
  it("counts a seek that lands just short of a chapter as that chapter", () => {
    expect(chapterIndexAt(chapters, 149.999)).toBe(1);
    expect(nextChapterStart(chapters, 149.999)).toBe(250);
    expect(chapterEndAt(chapters, 149.999, 300)).toBe(250);
  });

  it("ends the chapter playing, or the book past the last one", () => {
    expect(chapterEndAt(chapters, 120, 300)).toBe(150);
    expect(chapterEndAt([{ start: 0, end: 100, title: "" }], 120, 300)).toBe(
      300,
    );
    expect(chapterEndAt([], 120, 300)).toBeNull();
  });

  it("measures what is left of the chapter", () => {
    expect(remainingInChapter(chapters, 120)).toBe(30);
    expect(remainingInChapter([], 120)).toBeNull();
  });
});
