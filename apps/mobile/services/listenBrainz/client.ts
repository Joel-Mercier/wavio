import { isNetworkNoise, reportError } from "@/services/errorReporting";
import listenBrainzApiInstance from "@/services/listenBrainz";
import type {
  ListenSubmission,
  ValidateTokenResponse,
} from "@/services/listenBrainz/types";

// ListenBrainz caps a submit-listens request at 1000 listens (and 10,240,000
// bytes). The queue drains in batches of this size.
export const MAX_LISTENS_PER_REQUEST = 1000;

export type ValidateTokenResult =
  | { valid: true; userName: string }
  | { valid: false };

/**
 * Checks a user token and resolves the MusicBrainz username behind it.
 *
 * The token is passed explicitly rather than read from the store: this runs
 * while the user is still typing it into the settings screen, before anything
 * is persisted.
 */
export const validateToken = async (
  token: string,
  baseUrl?: string,
): Promise<ValidateTokenResult> => {
  const rsp = await listenBrainzApiInstance.get<ValidateTokenResponse>(
    "/1/validate-token",
    {
      headers: { Authorization: `Token ${token}` },
      ...(baseUrl ? { baseURL: baseUrl.replace(/\/+$/, "") } : {}),
    },
  );
  // A rejected token comes back as HTTP 200 with `valid: false`, so the body is
  // the only thing worth reading.
  if (rsp.data?.valid && rsp.data.user_name) {
    return { valid: true, userName: rsp.data.user_name };
  }
  return { valid: false };
};

export const submitListens = async (
  submission: ListenSubmission,
): Promise<void> => {
  await listenBrainzApiInstance.post("/1/submit-listens", submission);
};

/**
 * Fire-and-forget "this is playing right now" ping. Purely cosmetic on the
 * ListenBrainz profile and never queued: by the time a device is back online
 * the track it described has long stopped playing, so a failure is dropped.
 */
export const submitNowPlaying = async (
  submission: ListenSubmission,
): Promise<void> => {
  try {
    await submitListens(submission);
  } catch (error) {
    if (isNetworkNoise(error)) return;
    reportError(error, {
      area: "api",
      api: "listenbrainz",
      endpoint: "submit-listens:playing_now",
      unauthorizedIsExpected: true,
    });
  }
};
