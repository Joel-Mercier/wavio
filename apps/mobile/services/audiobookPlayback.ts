import axios from "axios";
import { queryClient } from "@/config/queryClient";
import {
  AudiobookshelfSessionExpiredError,
  absServerUrl,
} from "@/services/audiobookshelf/index";
import {
  audiobookFileUrl,
  audiobookSessionTrackUrl,
  parseAudiobookTrackId,
} from "@/services/audiobookshelf/keys";
import { updateMediaProgress } from "@/services/audiobookshelf/library";
import {
  absDeviceInfo,
  closePlaybackSession,
  MEDIA_PLAYER,
  startPlaybackSession,
  syncLocalSessions,
  syncPlaybackSession,
} from "@/services/audiobookshelf/sessions";
import type { AbsLocalSession } from "@/services/audiobookshelf/types";
import { isNetworkNoise, reportError } from "@/services/errorReporting";
import { getIsOnline, subscribeIsOnline } from "@/services/network";
import { downloadedAudiobookFile } from "@/stores/audiobookDownloads";
import {
  type AudiobookSnapshot,
  useAudiobookProgressBase,
} from "@/stores/audiobookProgress";
import {
  isAudiobookshelfConnected,
  useAudiobookshelfBase,
} from "@/stores/audiobookshelf";
import type { QueueTrack } from "@/stores/queue";
import { chapterEndAt, resumeOffsetInFile } from "@/utils/audiobookTimeline";

// The player's side of an Audiobookshelf book. Positions are kept in book time
// (what the server stores), progress is reported through a playback session,
// and listening done without the server is kept as a local session and
// uploaded once it answers again.

// How often an open session is told where playback is. The ABS apps use 15 s.
const SYNC_INTERVAL_MS = 15_000;
// A single status tick never accounts for more listening than this, so a
// stalled player or a suspended process can't credit hours of silence.
const MAX_TICK_SECONDS = 5;
// In-memory position changes smaller than this aren't worth a store write.
const STORE_DELTA_SECONDS = 5;
// The tail of a book that counts as having finished it.
const FINISH_GUARD_SECONDS = 30;

export type AudiobookTrack = QueueTrack & {
  source: "audiobook";
  audiobookItemId: string;
};

export function isAudiobookTrack(
  track: QueueTrack | null | undefined,
): track is AudiobookTrack {
  return (
    !!track &&
    track.source === "audiobook" &&
    typeof track.audiobookItemId === "string"
  );
}

function trackItemId(track: QueueTrack): string {
  return (
    (track.audiobookItemId as string | undefined) ??
    parseAudiobookTrackId(track.id)?.itemId ??
    ""
  );
}

function trackSpan(track: QueueTrack) {
  return {
    startOffset: Number(track.bookStartOffset) || 0,
    duration: Number(track.duration) || 0,
  };
}

/**
 * Index of the first queued item that isn't the current book (wrapping around
 * on repeat-all), or -1: where next goes from a book's last chapter.
 */
export function indexPastAudiobook(
  queue: readonly QueueTrack[],
  currentIndex: number,
  repeatMode: "off" | "all" | "one",
): number {
  const itemId = queue[currentIndex]?.audiobookItemId;
  const after = queue.findIndex(
    (track, i) => i > currentIndex && track.audiobookItemId !== itemId,
  );
  if (after >= 0 || repeatMode !== "all") return after;
  return queue.findIndex((track) => track.audiobookItemId !== itemId);
}

export function bookTimeOf(track: QueueTrack, positionInFile: number): number {
  return trackSpan(track).startOffset + Math.max(0, positionInFile);
}

export function getAudiobookSnapshot(
  itemId: string,
): AudiobookSnapshot | undefined {
  return useAudiobookProgressBase.getState().books[itemId];
}

export function audiobookChapterEndAt(
  itemId: string,
  bookTime: number,
): number | null {
  const book = getAudiobookSnapshot(itemId);
  return book ? chapterEndAt(book.chapters, bookTime, book.duration) : null;
}

// The latest position of each book this run, ahead of the throttled store copy.
const livePositions = new Map<string, number>();

export function getAudiobookPosition(itemId: string): number | null {
  const live = livePositions.get(itemId);
  if (live != null) return live;
  const stored = useAudiobookProgressBase.getState().positions[itemId];
  if (!stored || stored.isFinished) return null;
  return stored.currentTime;
}

// A one-shot start point for the next load of a specific file: a chapter jump
// or a resume from the book screen. Outranks the saved position, which the
// outgoing file's flush overwrites in the same queue change.
let pendingStart: { trackId: string; offset: number } | null = null;

export function requestAudiobookStart(trackId: string, offset: number) {
  pendingStart = { trackId, offset: Math.max(0, offset) };
}

export function getAudiobookResumePosition(track: QueueTrack): number | null {
  if (pendingStart?.trackId === track.id) {
    const { offset } = pendingStart;
    pendingStart = null;
    return offset > 0 ? offset : null;
  }
  return resumeOffsetInFile(
    trackSpan(track),
    getAudiobookPosition(trackItemId(track)),
  );
}

/** Where the local engine should read a file from. */
export function audiobookPlaybackUrl(
  track: QueueTrack,
): { url: string; isOffline: boolean } | null {
  const parsed = parseAudiobookTrackId(track.id);
  if (!parsed) return null;
  const downloaded = downloadedAudiobookFile(parsed.itemId, parsed.ino);
  if (downloaded) return { url: downloaded.path, isOffline: true };
  const serverUrl = absServerUrl();
  if (!serverUrl) return null;
  return {
    url: audiobookFileUrl(serverUrl, parsed.itemId, parsed.ino),
    isOffline: false,
  };
}

/**
 * The URL a Cast receiver or UPnP renderer should fetch. Neither can send our
 * bearer token, so it is the open session's public track URL; with no session
 * yet, the token rides in the query (accepted on GETs) for that one file.
 */
export function audiobookRemoteUrl(track: QueueTrack): string | undefined {
  const parsed = parseAudiobookTrackId(track.id);
  const serverUrl = absServerUrl();
  if (!parsed || !serverUrl) return undefined;
  if (active?.itemId === parsed.itemId && active.sessionId) {
    return audiobookSessionTrackUrl(
      serverUrl,
      active.sessionId,
      Number(track.audiobookFileIndex) || 1,
    );
  }
  const { accessToken } = useAudiobookshelfBase.getState();
  return `${audiobookFileUrl(serverUrl, parsed.itemId, parsed.ino)}?token=${encodeURIComponent(accessToken)}`;
}

/** Open a server session for the book now, so remote URLs can use it. */
export async function ensureAudiobookSession(track: QueueTrack): Promise<void> {
  if (!isAudiobookTrack(track)) return;
  const runtime = activate(track);
  try {
    await openSession(runtime);
  } catch {}
}

interface BookRuntime {
  itemId: string;
  sessionId: string | null;
  opening: Promise<string> | null;
  unsyncedSeconds: number;
  currentTime: number;
  duration: number;
  lastTickAt: number | null;
  lastSyncAt: number;
  lastStoredTime: number;
  syncing: boolean;
  // Finished and not played since: whatever the engine reports while parked
  // on the last file, or as the queue moves on, isn't a position.
  finished: boolean;
  // Dropped by a sign-out: an in-flight sync must no longer touch the stores,
  // which may already belong to the next account.
  detached: boolean;
  local: AbsLocalSession;
}

let active: BookRuntime | null = null;

function newLocalSession(
  itemId: string,
  currentTime: number,
  duration: number,
): AbsLocalSession {
  const book = getAudiobookSnapshot(itemId);
  const now = Date.now();
  return {
    id: `play_local_${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    libraryItemId: itemId,
    libraryId: book?.libraryId ?? "",
    mediaType: "book",
    displayTitle: book?.title ?? "",
    displayAuthor: book?.author ?? "",
    duration,
    startTime: currentTime,
    currentTime,
    timeListening: 0,
    startedAt: now,
    updatedAt: now,
    mediaPlayer: MEDIA_PLAYER,
    playMethod: 3,
    deviceInfo: absDeviceInfo(),
  };
}

function activate(track: QueueTrack): BookRuntime {
  const itemId = trackItemId(track);
  if (active?.itemId === itemId) return active;
  if (active) void finish(active);
  const duration = Number(track.bookDuration) || 0;
  const currentTime = getAudiobookPosition(itemId) ?? 0;
  active = {
    itemId,
    sessionId: null,
    opening: null,
    unsyncedSeconds: 0,
    currentTime,
    duration,
    lastTickAt: null,
    lastSyncAt: 0,
    lastStoredTime: currentTime,
    syncing: false,
    finished:
      useAudiobookProgressBase.getState().positions[itemId]?.isFinished ??
      false,
    detached: false,
    local: newLocalSession(itemId, currentTime, duration),
  };
  return active;
}

function openSession(runtime: BookRuntime): Promise<string> {
  if (runtime.sessionId) return Promise.resolve(runtime.sessionId);
  runtime.opening ??= startPlaybackSession(runtime.itemId)
    .then((session) => {
      runtime.sessionId = session.id;
      return session.id;
    })
    .finally(() => {
      runtime.opening = null;
    });
  return runtime.opening;
}

function isUnreachable(error: unknown): boolean {
  return (
    isNetworkNoise(error) || error instanceof AudiobookshelfSessionExpiredError
  );
}

function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function storePosition(runtime: BookRuntime, force = false) {
  if (runtime.finished) return;
  livePositions.set(runtime.itemId, runtime.currentTime);
  if (
    !force &&
    Math.abs(runtime.currentTime - runtime.lastStoredTime) < STORE_DELTA_SECONDS
  )
    return;
  runtime.lastStoredTime = runtime.currentTime;
  useAudiobookProgressBase.getState().setPosition(runtime.itemId, {
    currentTime: runtime.currentTime,
    duration: runtime.duration,
    isFinished: false,
    updatedAt: Date.now(),
  });
}

function keepLocally(runtime: BookRuntime) {
  if (runtime.unsyncedSeconds <= 0) return;
  runtime.local = {
    ...runtime.local,
    currentTime: runtime.currentTime,
    timeListening: Math.round(runtime.unsyncedSeconds),
    duration: runtime.duration,
    updatedAt: Date.now(),
  };
  useAudiobookProgressBase.getState().upsertPendingSession(runtime.local);
}

async function sync(runtime: BookRuntime, close = false): Promise<void> {
  if (runtime.syncing && !close) return;
  runtime.syncing = true;
  runtime.lastSyncAt = Date.now();
  const listened = runtime.unsyncedSeconds;
  const payload = {
    currentTime: runtime.currentTime,
    timeListened: Math.round(listened),
    duration: runtime.duration,
  };
  try {
    if (!getIsOnline() || !isAudiobookshelfConnected()) {
      keepLocally(runtime);
      return;
    }
    let sessionId = await openSession(runtime);
    if (runtime.detached) return;
    try {
      await syncPlaybackSession(sessionId, payload);
    } catch (error) {
      if (!isNotFound(error) || runtime.detached) throw error;
      // The server closed it (another session from this device, or 36 h idle).
      runtime.sessionId = null;
      sessionId = await openSession(runtime);
      if (runtime.detached) return;
      await syncPlaybackSession(sessionId, payload);
    }
    if (runtime.detached) return;
    runtime.unsyncedSeconds = Math.max(0, runtime.unsyncedSeconds - listened);
    useAudiobookProgressBase
      .getState()
      .removePendingSessions([runtime.local.id]);
    runtime.local = newLocalSession(
      runtime.itemId,
      runtime.currentTime,
      runtime.duration,
    );
    if (close && runtime.sessionId) {
      const closing = runtime.sessionId;
      runtime.sessionId = null;
      await closePlaybackSession(closing).catch(() => {});
    }
  } catch (error) {
    if (runtime.detached) return;
    if (isUnreachable(error)) keepLocally(runtime);
    else
      reportError(error, {
        area: "player",
        api: "audiobookshelf",
        endpoint: "session-sync",
      });
  } finally {
    runtime.syncing = false;
  }
}

async function finish(runtime: BookRuntime): Promise<void> {
  storePosition(runtime, true);
  await sync(runtime, true);
}

/**
 * Feed a position from the engine (or a remote target). `playing` credits the
 * wall-clock time since the previous tick as listening; `force` reports to the
 * server now instead of waiting for the interval.
 */
export function recordAudiobookProgress(
  track: QueueTrack,
  positionInFile: number,
  { playing, force }: { playing: boolean; force?: boolean },
) {
  if (!isAudiobookTrack(track)) return;
  const runtime = activate(track);
  if (runtime.finished && !playing) {
    if (force) void sync(runtime);
    return;
  }
  runtime.finished = false;
  const now = Date.now();
  if (playing && runtime.lastTickAt != null) {
    runtime.unsyncedSeconds += Math.min(
      MAX_TICK_SECONDS,
      Math.max(0, (now - runtime.lastTickAt) / 1000),
    );
  }
  runtime.lastTickAt = playing ? now : null;
  runtime.currentTime = bookTimeOf(track, positionInFile);
  if (Number(track.bookDuration) > 0)
    runtime.duration = Number(track.bookDuration);
  storePosition(runtime, force);
  if (force || now - runtime.lastSyncAt >= SYNC_INTERVAL_MS) {
    void sync(runtime);
  }
}

/** The queue left the book (another book, music, or a stop). */
export function endAudiobookPlayback() {
  const runtime = active;
  active = null;
  if (runtime) void finish(runtime);
}

export function isBookTail(track: QueueTrack): boolean {
  const span = trackSpan(track);
  const total = Number(track.bookDuration) || 0;
  return total > 0 && span.startOffset + span.duration >= total - 1;
}

// The engine finished a file. Only the last one finishes the book.
export function markAudiobookTrackFinished(track: QueueTrack) {
  if (!isAudiobookTrack(track) || !isBookTail(track)) return;
  void setAudiobookFinished(trackItemId(track), true);
}

export function isNearBookEnd(itemId: string, bookTime: number): boolean {
  const duration =
    getAudiobookSnapshot(itemId)?.duration ??
    useAudiobookProgressBase.getState().positions[itemId]?.duration ??
    0;
  return duration > 0 && bookTime >= duration - FINISH_GUARD_SECONDS;
}

export async function setAudiobookFinished(
  itemId: string,
  isFinished: boolean,
): Promise<void> {
  const duration =
    getAudiobookSnapshot(itemId)?.duration ??
    useAudiobookProgressBase.getState().positions[itemId]?.duration ??
    0;
  livePositions.delete(itemId);
  if (active?.itemId === itemId) {
    active.currentTime = isFinished ? duration : 0;
    active.finished = isFinished;
  }
  if (isFinished) {
    useAudiobookProgressBase.getState().setPosition(itemId, {
      currentTime: duration,
      duration,
      isFinished: true,
      updatedAt: Date.now(),
    });
  } else {
    useAudiobookProgressBase.getState().removePosition(itemId);
  }
  try {
    await updateMediaProgress(
      itemId,
      isFinished
        ? { isFinished: true }
        : { isFinished: false, currentTime: 0, progress: 0 },
    );
  } finally {
    void queryClient.invalidateQueries({ queryKey: ["abs"] });
  }
}

/**
 * Seed the saved position from the server's, when the server's is newer (the
 * book was listened to on another device since).
 */
export function reconcileAudiobookPosition(
  itemId: string,
  server: {
    currentTime: number;
    duration: number;
    isFinished: boolean;
    lastUpdate: number;
  } | null,
) {
  if (!server) return;
  const local = useAudiobookProgressBase.getState().positions[itemId];
  if (local && local.updatedAt >= server.lastUpdate) return;
  if (active?.itemId === itemId) return;
  livePositions.delete(itemId);
  useAudiobookProgressBase.getState().setPosition(itemId, {
    currentTime: server.currentTime,
    duration: server.duration,
    isFinished: server.isFinished,
    updatedAt: server.lastUpdate,
  });
}

let uploadingLocal = false;

/** Upload listening recorded while the server was out of reach. */
export async function uploadPendingAudiobookSessions(): Promise<void> {
  if (uploadingLocal || !getIsOnline() || !isAudiobookshelfConnected()) return;
  const pending = useAudiobookProgressBase
    .getState()
    .pendingSessions.filter((session) => session.id !== active?.local.id);
  if (pending.length === 0) return;
  uploadingLocal = true;
  try {
    await syncLocalSessions(pending);
    useAudiobookProgressBase
      .getState()
      .removePendingSessions(pending.map((session) => session.id));
    void queryClient.invalidateQueries({ queryKey: ["abs"] });
  } catch (error) {
    if (!isUnreachable(error))
      reportError(error, {
        area: "player",
        api: "audiobookshelf",
        endpoint: "session-local",
      });
  } finally {
    uploadingLocal = false;
  }
}

let syncStarted = false;

/** Upload pending listening now and whenever the device comes back online. */
export function initAudiobookSync() {
  if (!syncStarted) {
    syncStarted = true;
    subscribeIsOnline(() => {
      if (getIsOnline()) void uploadPendingAudiobookSessions();
    });
  }
  void uploadPendingAudiobookSessions();
}

/**
 * Sign-out or scope change: keep the position and the unsynced listening (as a
 * local session, uploaded when this account is active again) while the stores
 * still belong to this account, and close the server session without waiting.
 */
export function resetAudiobookPlaybackRuntime() {
  if (active) {
    active.detached = true;
    storePosition(active, true);
    keepLocally(active);
    if (active.sessionId) {
      const { serverUrl, accessToken } = useAudiobookshelfBase.getState();
      void closePlaybackSession(active.sessionId, undefined, {
        serverUrl,
        accessToken,
      }).catch(() => {});
    }
  }
  active = null;
  pendingStart = null;
  livePositions.clear();
}
