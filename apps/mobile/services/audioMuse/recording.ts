import { audioMuseRequest } from "@/services/audioMuse";
import type {
  AudioMuseRecordingMatch,
  AudioMuseRecordingSearchResponse,
} from "@/services/audioMuse/types";

// Search by recording: a clip of whatever is playing nearby is matched against
// the neural fingerprints AudioMuse stored for every analysed track. The server
// records 20 s in its own web UI and reads at most 60 s; past ~5 s there is
// enough for a match, which is why the user may stop early.
export const RECORDING_SECONDS = 20;
export const RECORDING_MIN_SECONDS = 5;

// Only the best match can be identified, and the runners-up are a fallback list
// when it isn't — a long tail would be noise.
export const RECORDING_RESULTS = 20;

// The fingerprint encoder loads on first use and then aligns the clip against
// the whole index, well past the instance-wide 15s reachability budget.
const RECORDING_TIMEOUT_MS = 120_000;

/**
 * Loads the fingerprint encoder ahead of the search, as AudioMuse's own page
 * does on open. Purely an optimisation: if it fails, the search loads it itself.
 */
export async function warmUpRecordingSearch(): Promise<void> {
  try {
    await audioMuseRequest("/api/recording_search/warmup", {
      method: "post",
      skipServerScope: true,
      timeout: RECORDING_TIMEOUT_MS,
      notFoundIsExpected: true,
      serviceUnavailableIsExpected: true,
    });
  } catch {
    // Best-effort; the search reports any real failure.
  }
}

/**
 * Uploads a recorded clip and returns the library tracks it could be, best
 * first. A 400 is the clip's fault (silent, too short, undecodable) and a 503 an
 * index that isn't built or loaded yet; both carry a reason the caller relays
 * via audioMuseErrorMessage, so neither is reported as a bug.
 */
export async function searchByRecording({
  uri,
  signal,
}: {
  uri: string;
  signal?: AbortSignal;
}): Promise<AudioMuseRecordingMatch[]> {
  const form = new FormData();
  // React Native's FormData takes a file descriptor object in place of a Blob.
  // The extension matters: AudioMuse picks its decoder by it.
  form.append("clip", {
    uri,
    name: "recording.m4a",
    type: "audio/mp4",
  } as unknown as Blob);
  form.append("n_results", String(RECORDING_RESULTS));

  const rsp = await audioMuseRequest<AudioMuseRecordingSearchResponse>(
    "/api/recording_search/search",
    {
      method: "post",
      data: form,
      // The instance defaults to JSON, which would make axios serialise the
      // form into a JSON object instead of sending the file.
      headers: { "Content-Type": "multipart/form-data" },
      timeout: RECORDING_TIMEOUT_MS,
      badRequestIsExpected: true,
      serviceUnavailableIsExpected: true,
      signal,
    },
  );
  return (rsp?.results ?? []).filter((match) => !!match.item_id);
}
