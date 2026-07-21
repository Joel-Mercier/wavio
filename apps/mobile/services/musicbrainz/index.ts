import axios from "axios";
import * as Application from "expo-application";
import { AbortedError, createRateLimitedQueue } from "@/utils/rateLimitedQueue";

const BASE_URL = "https://musicbrainz.org/ws/2";

// MusicBrainz requires a User-Agent that identifies the application and offers a
// way to contact its author; a generic or absent one is grounds for blocking.
const USER_AGENT = `Wavio/${Application.nativeApplicationVersion ?? "1.0.0"} ( https://github.com/Joel-Mercier/wavio )`;

// One call per second is the documented hard limit, enforced per client IP.
// The extra 50ms and the jitter absorb clock skew and keep a burst of app
// instances from lining up on the same second boundary.
const MIN_INTERVAL_MS = 1050;
const JITTER_MS = 150;

export const musicBrainzQueue = createRateLimitedQueue({
  minIntervalMs: MIN_INTERVAL_MS,
  jitterMs: JITTER_MS,
});

const musicBrainzApiInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  },
});

/**
 * Every MusicBrainz call goes through the shared rate-limited queue. A 503 is
 * MusicBrainz signalling the rate limiter rather than a server fault, so it gets
 * one retry a full interval later; anything else propagates to the caller.
 */
export async function musicBrainzRequest<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const call = async () => {
    // The signal goes to axios as well as the queue: the queue can only refuse
    // to *start* a request, so without this a cancel left the request already on
    // the wire running to its 15s timeout.
    const rsp = await musicBrainzApiInstance.get<T>(path, {
      params: { ...params, fmt: "json" },
      signal,
    });
    if (__DEV__) {
      // Matching failures are almost always the *query*, not the scoring, so
      // the exact query and the shape of the answer are what's worth seeing.
      const data = rsp.data as { count?: number; releases?: unknown[] };
      console.log(
        `[musicbrainz] ${path} ${JSON.stringify(params.query ?? params.inc ?? "")} -> ` +
          `count=${data?.count ?? "n/a"} returned=${data?.releases?.length ?? "n/a"}`,
      );
    }
    return rsp.data;
  };

  try {
    return await musicBrainzQueue.run(call, signal);
  } catch (error) {
    // Axios raises its own CanceledError for an aborted request, and the queue
    // raises AbortedError for one it refused to start. Both are the same event,
    // so they're normalised to one type here — otherwise the scan loop would
    // recognise only the queue's, and report a user-initiated stop to Sentry as
    // a genuine failure while counting the album as unmatched. It also stops a
    // cancelled request from being retried below.
    if (axios.isCancel(error) || signal?.aborted) throw new AbortedError();
    if (axios.isAxiosError(error) && error.response?.status === 503) {
      return musicBrainzQueue.run(call, signal);
    }
    throw error;
  }
}

export function coverArtArchiveUrl(releaseMbid: string, size = 500): string {
  return `https://coverartarchive.org/release/${releaseMbid}/front-${size}`;
}

export default musicBrainzApiInstance;
