// Progress for a book is reported through an Audiobookshelf playback session,
// which the server closes on its own (another session from this device, or 36 h
// idle). Listening must survive that and the server being out of reach.
const mockStart = jest.fn();
const mockSync = jest.fn();
const mockClose = jest.fn();
const mockSyncLocal = jest.fn();
const mockUpdateProgress = jest.fn();
let mockOnline = true;

jest.mock("@/services/audiobookshelf/sessions", () => ({
  MEDIA_PLAYER: "wavio",
  absDeviceInfo: () => ({
    deviceId: "d",
    clientName: "Wavio",
    clientVersion: "1",
  }),
  startPlaybackSession: (...args: unknown[]) => mockStart(...args),
  syncPlaybackSession: (...args: unknown[]) => mockSync(...args),
  closePlaybackSession: (...args: unknown[]) => mockClose(...args),
  syncLocalSessions: (...args: unknown[]) => mockSyncLocal(...args),
}));
jest.mock("@/services/audiobookshelf/library", () => ({
  updateMediaProgress: (...args: unknown[]) => mockUpdateProgress(...args),
}));
jest.mock("@/services/audiobookshelf/index", () => {
  class AudiobookshelfSessionExpiredError extends Error {}
  return {
    AudiobookshelfSessionExpiredError,
    absServerUrl: () => "http://abs",
  };
});
jest.mock("@/services/network", () => ({
  getIsOnline: () => mockOnline,
  subscribeIsOnline: () => () => {},
}));
jest.mock("@/config/queryClient", () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock("@/services/errorReporting", () => {
  const isNetworkNoise = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError) &&
    !(e as { response?: unknown }).response;
  return { reportError: jest.fn(), isNetworkNoise };
});
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    isAxiosError: (e: unknown) =>
      Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
  },
}));
jest.mock("@/config/storage", () => {
  const storage = () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  });
  return {
    createDynamicScopedStorage: storage,
    createThrottledScopedJSONStorage: storage,
  };
});
jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  endAudiobookPlayback,
  getAudiobookResumePosition,
  indexPastAudiobook,
  markAudiobookTrackFinished,
  recordAudiobookProgress,
  requestAudiobookStart,
  resetAudiobookPlaybackRuntime,
  uploadPendingAudiobookSessions,
} from "@/services/audiobookPlayback";
import { useAudiobookProgressBase } from "@/stores/audiobookProgress";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";
import type { QueueTrack } from "@/stores/queue";

const flush = () => new Promise((resolve) => setImmediate(resolve));

const file = (ino: string, startOffset: number): QueueTrack => ({
  id: `abs:book:${ino}`,
  url: "",
  source: "audiobook",
  audiobookItemId: "book",
  audiobookIno: ino,
  audiobookFileIndex: startOffset === 0 ? 1 : 2,
  bookStartOffset: startOffset,
  bookDuration: 200,
  duration: 100,
});
const first = file("a", 0);
const second = file("b", 100);

const notFound = () =>
  Object.assign(new Error("404"), {
    isAxiosError: true,
    response: { status: 404 },
  });
const offline = () =>
  Object.assign(new Error("Network Error"), { isAxiosError: true });

beforeEach(() => {
  jest.useRealTimers();
  mockOnline = true;
  for (const mock of [
    mockStart,
    mockSync,
    mockClose,
    mockSyncLocal,
    mockUpdateProgress,
  ])
    mock.mockReset();
  mockStart
    .mockResolvedValueOnce({ id: "s1" })
    .mockResolvedValueOnce({ id: "s2" });
  mockSync.mockResolvedValue(undefined);
  mockClose.mockResolvedValue(undefined);
  mockSyncLocal.mockResolvedValue(undefined);
  mockUpdateProgress.mockResolvedValue(undefined);
  resetAudiobookPlaybackRuntime();
  useAudiobookProgressBase.getState().__reset();
  useAudiobookshelfBase.getState().__reset();
  useAudiobookshelfBase.getState().setSession({
    serverUrl: "http://abs",
    username: "root",
    userId: "u",
    accessToken: "t",
    refreshToken: "r",
    serverVersion: "2.37.2",
    canDownload: true,
    canDelete: true,
  });
});

describe("session sync", () => {
  it("opens a session and reports book time, not file time", async () => {
    recordAudiobookProgress(second, 30, { playing: false, force: true });
    await flush();
    expect(mockStart).toHaveBeenCalledWith("book");
    expect(mockSync).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ currentTime: 130, duration: 200 }),
    );
  });

  it("re-opens a session the server closed and syncs again", async () => {
    mockSync.mockRejectedValueOnce(notFound());
    recordAudiobookProgress(first, 40, { playing: false, force: true });
    await flush();
    await flush();
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockSync).toHaveBeenLastCalledWith(
      "s2",
      expect.objectContaining({ currentTime: 40 }),
    );
  });

  it("keeps listening done offline as a local session and uploads it later", async () => {
    mockOnline = false;
    recordAudiobookProgress(first, 10, { playing: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    recordAudiobookProgress(first, 11, { playing: true, force: true });
    await flush();
    const [pending] = useAudiobookProgressBase.getState().pendingSessions;
    expect(pending).toMatchObject({
      libraryItemId: "book",
      currentTime: 11,
      timeListening: 1,
    });
    expect(mockSync).not.toHaveBeenCalled();

    endAudiobookPlayback();
    await flush();
    mockOnline = true;
    await uploadPendingAudiobookSessions();
    expect(mockSyncLocal).toHaveBeenCalledWith([
      expect.objectContaining({ id: pending.id }),
    ]);
    expect(useAudiobookProgressBase.getState().pendingSessions).toEqual([]);
  });

  it("treats an unreachable server like being offline", async () => {
    mockStart.mockReset().mockRejectedValue(offline());
    recordAudiobookProgress(first, 5, { playing: true });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    recordAudiobookProgress(first, 6, { playing: true, force: true });
    await flush();
    expect(useAudiobookProgressBase.getState().pendingSessions).toHaveLength(1);
  });

  it("closes the session when playback leaves the book", async () => {
    recordAudiobookProgress(first, 5, { playing: false, force: true });
    await flush();
    endAudiobookPlayback();
    await flush();
    await flush();
    expect(mockClose).toHaveBeenCalledWith("s1");
  });
});

describe("resume", () => {
  it("resumes the file holding the saved position and starts the others at 0", () => {
    recordAudiobookProgress(second, 30, { playing: false });
    expect(getAudiobookResumePosition(second)).toBe(30);
    expect(getAudiobookResumePosition(first)).toBeNull();
  });

  it("lets a chapter jump outrank the saved position, once", () => {
    recordAudiobookProgress(second, 30, { playing: false });
    requestAudiobookStart(second.id, 75);
    expect(getAudiobookResumePosition(second)).toBe(75);
    expect(getAudiobookResumePosition(second)).toBe(30);
  });

  it("only finishing the last file finishes the book", async () => {
    markAudiobookTrackFinished(first);
    expect(mockUpdateProgress).not.toHaveBeenCalled();
    markAudiobookTrackFinished(second);
    await flush();
    expect(mockUpdateProgress).toHaveBeenCalledWith("book", {
      isFinished: true,
    });
    expect(useAudiobookProgressBase.getState().positions.book).toMatchObject({
      isFinished: true,
    });
    expect(getAudiobookResumePosition(second)).toBeNull();
  });

  it("keeps a finished book finished while the engine parks and the queue moves on", async () => {
    recordAudiobookProgress(second, 100, { playing: false });
    markAudiobookTrackFinished(second);
    await flush();
    recordAudiobookProgress(second, 0, { playing: false, force: true });
    endAudiobookPlayback();
    await flush();
    await flush();
    expect(useAudiobookProgressBase.getState().positions.book).toMatchObject({
      isFinished: true,
    });
    expect(getAudiobookResumePosition(second)).toBeNull();
    expect(mockSync).toHaveBeenLastCalledWith(
      "s1",
      expect.objectContaining({ currentTime: 200 }),
    );
  });

  it("unmarks a finished book once it plays again", async () => {
    markAudiobookTrackFinished(second);
    await flush();
    recordAudiobookProgress(second, 20, { playing: true, force: true });
    expect(useAudiobookProgressBase.getState().positions.book).toMatchObject({
      currentTime: 120,
      isFinished: false,
    });
  });
});

describe("sign-out", () => {
  it("keeps unsynced listening locally and closes the session without waiting", async () => {
    recordAudiobookProgress(first, 10, { playing: true });
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    let finishSync: () => void = () => {};
    mockSync.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishSync = resolve)),
    );
    recordAudiobookProgress(first, 11, { playing: true, force: true });
    await flush();

    resetAudiobookPlaybackRuntime();
    expect(mockClose).toHaveBeenCalledWith("s1", undefined, {
      serverUrl: "http://abs",
      accessToken: "t",
    });
    expect(useAudiobookProgressBase.getState().positions.book).toMatchObject({
      currentTime: 11,
    });

    finishSync();
    await flush();
    expect(useAudiobookProgressBase.getState().pendingSessions).toEqual([
      expect.objectContaining({ libraryItemId: "book", timeListening: 1 }),
    ]);
  });
});

describe("indexPastAudiobook", () => {
  const song = { id: "song", url: "" } as QueueTrack;

  it("skips the rest of the book's files", () => {
    expect(indexPastAudiobook([first, second, song], 0, "off")).toBe(2);
  });

  it("wraps on repeat-all and stops otherwise", () => {
    expect(indexPastAudiobook([song, first, second], 1, "off")).toBe(-1);
    expect(indexPastAudiobook([song, first, second], 1, "all")).toBe(0);
    expect(indexPastAudiobook([first, second], 0, "all")).toBe(-1);
  });
});
