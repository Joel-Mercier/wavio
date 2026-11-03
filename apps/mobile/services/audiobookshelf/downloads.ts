import axios from "axios";
import { Directory, File, Paths } from "expo-file-system";
import {
  absServerUrl,
  refreshAccessToken,
} from "@/services/audiobookshelf/index";
import { audiobookFileDownloadUrl } from "@/services/audiobookshelf/keys";
import { getLibraryItem } from "@/services/audiobookshelf/library";
import { rememberAudiobook } from "@/services/audiobookshelf/play";
import { reportError } from "@/services/errorReporting";
import { getIsOnline, subscribeIsOnline } from "@/services/network";
import { requestHeadersForUrl } from "@/services/serverHeaders";
import { useAudiobookDownloadsBase } from "@/stores/audiobookDownloads";
import { useAudiobookProgressBase } from "@/stores/audiobookProgress";
import { currentAuthScope } from "@/stores/auth";

// Whole-book downloads, one file at a time. Kept out of the music download
// service (services/offline) on purpose: that one models tracks of albums and
// playlists, and a book's files would show up there as songs.

function bookDirectory(scope: string, itemId: string): Directory {
  return new Directory(Paths.document, "audiobooks", scope, itemId);
}

const cancelled = new Set<string>();
// Books waiting in the chain or downloading, so asking again doesn't queue a
// second run or flip a running download's status back to "queued".
const scheduled = new Map<string, Promise<void>>();
let chain: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const next = chain.then(task, task);
  chain = next.catch(() => {});
  return next;
}

async function fetchFile(url: string, destination: File): Promise<File> {
  const attempt = () =>
    File.downloadFileAsync(url, destination, {
      idempotent: true,
      headers: requestHeadersForUrl(url),
    });
  try {
    return await attempt();
  } catch (error) {
    // The token may have expired mid-book; one refresh, then give up.
    await refreshAccessToken();
    try {
      return await attempt();
    } catch {
      throw error;
    }
  }
}

async function runDownload(itemId: string): Promise<void> {
  const store = useAudiobookDownloadsBase.getState();
  const scope = currentAuthScope();
  const serverUrl = absServerUrl();
  if (cancelled.has(itemId)) return;
  if (!serverUrl || !getIsOnline()) {
    store.upsert(itemId, { status: "queued" });
    return;
  }
  store.upsert(itemId, { status: "downloading", error: undefined });
  try {
    const book =
      rememberAudiobook(await getLibraryItem(itemId)) ??
      useAudiobookProgressBase.getState().books[itemId];
    if (!book) throw new Error("Audiobook has no audio files");
    store.upsert(itemId, {
      totalFiles: book.files.length,
      totalBytes: book.files.reduce((sum, file) => sum + file.size, 0),
    });
    const directory = bookDirectory(scope, itemId);
    directory.create({ idempotent: true, intermediates: true });
    for (const file of book.files) {
      if (cancelled.has(itemId) || currentAuthScope() !== scope) return;
      const existing =
        useAudiobookDownloadsBase.getState().downloads[itemId]?.files[file.ino];
      if (existing && new File(existing.path).exists) continue;
      const url = audiobookFileDownloadUrl(serverUrl, itemId, file.ino);
      const target = new File(directory, `${file.ino}.${file.ext}`);
      const result = await fetchFile(url, target);
      if (cancelled.has(itemId) || currentAuthScope() !== scope) {
        try {
          result.delete();
        } catch {}
        return;
      }
      useAudiobookDownloadsBase.getState().addFile(itemId, file.ino, {
        path: result.uri,
        size: result.size ?? file.size,
      });
    }
    useAudiobookDownloadsBase.getState().upsert(itemId, { status: "done" });
  } catch (error) {
    if (currentAuthScope() !== scope) return;
    const offline =
      !getIsOnline() || (axios.isAxiosError(error) && !error.response);
    useAudiobookDownloadsBase.getState().upsert(itemId, {
      status: offline ? "queued" : "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    if (!offline)
      reportError(error, {
        area: "storage",
        api: "audiobookshelf",
        endpoint: "audiobook-download",
      });
  }
}

export function downloadAudiobook(itemId: string): Promise<void> {
  cancelled.delete(itemId);
  const existing = useAudiobookDownloadsBase.getState().downloads[itemId];
  if (existing?.status === "done") return Promise.resolve();
  const pending = scheduled.get(itemId);
  if (pending) return pending;
  useAudiobookDownloadsBase
    .getState()
    .upsert(itemId, { status: "queued", error: undefined });
  const task = enqueue(() => runDownload(itemId)).finally(() => {
    if (scheduled.get(itemId) === task) scheduled.delete(itemId);
  });
  scheduled.set(itemId, task);
  return task;
}

export function removeAudiobookDownload(itemId: string): void {
  cancelled.add(itemId);
  scheduled.delete(itemId);
  useAudiobookDownloadsBase.getState().remove(itemId);
  try {
    const directory = bookDirectory(currentAuthScope(), itemId);
    if (directory.exists) directory.delete();
  } catch (error) {
    reportError(error, {
      area: "storage",
      api: "audiobookshelf",
      endpoint: "audiobook-download-remove",
    });
  }
}

let downloadsStarted = false;

/** Resume unfinished downloads now and whenever the device comes back online. */
export function initAudiobookDownloads(): void {
  if (!downloadsStarted) {
    downloadsStarted = true;
    subscribeIsOnline(() => {
      if (getIsOnline()) resumeAudiobookDownloads();
    });
  }
  resumeAudiobookDownloads();
}

/** Pick up downloads an app kill or a dropped connection left unfinished. */
export function resumeAudiobookDownloads(): void {
  const { downloads } = useAudiobookDownloadsBase.getState();
  for (const download of Object.values(downloads)) {
    if (download.status === "queued" || download.status === "downloading") {
      void downloadAudiobook(download.itemId);
    }
  }
}
