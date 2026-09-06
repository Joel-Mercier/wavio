// Last.fm reports failures as `{ error, message }` inside an HTTP 200 body far
// more often than as an HTTP status, so nothing here may key off the status the
// way services/listenBrainz/scrobbler.ts does.
// https://www.last.fm/api/errorcodes
export class LastFmApiError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message || `Last.fm error ${code}`);
    this.name = "LastFmApiError";
    this.code = code;
  }
}

export const LASTFM_ERROR = {
  INVALID_SERVICE: 2,
  INVALID_METHOD: 3,
  AUTH_FAILED: 4,
  INVALID_PARAMETERS: 6,
  OPERATION_FAILED: 8,
  INVALID_SESSION_KEY: 9,
  INVALID_API_KEY: 10,
  SERVICE_OFFLINE: 11,
  INVALID_SIGNATURE: 13,
  UNAUTHORIZED_TOKEN: 14,
  SERVICE_UNAVAILABLE: 16,
  API_KEY_SUSPENDED: 26,
  RATE_LIMITED: 29,
} as const;

export const isLastFmApiError = (error: unknown): error is LastFmApiError =>
  error instanceof LastFmApiError;

export const lastFmErrorCode = (error: unknown): number | undefined =>
  isLastFmApiError(error) ? error.code : undefined;

// The session key was revoked at last.fm/settings/applications, or the account
// was deleted. Nothing we send will be accepted until the user signs in again,
// so the caller flips the store into its re-auth state rather than retrying.
export const isSessionInvalid = (error: unknown): boolean =>
  lastFmErrorCode(error) === LASTFM_ERROR.INVALID_SESSION_KEY;

// The user never approved the token in the browser (or approved a different
// one). Expected during the handshake, so the settings screen offers a retry
// instead of reporting a bug.
export const isTokenNotAuthorized = (error: unknown): boolean =>
  lastFmErrorCode(error) === LASTFM_ERROR.UNAUTHORIZED_TOKEN;

// Worth sending again later: the backend blinked, the service is down, or we're
// being rate limited. Everything else in the 4xx-equivalent range is a verdict
// on the request itself and repeating it can only produce the same answer.
const TRANSIENT_CODES = new Set<number>([
  LASTFM_ERROR.OPERATION_FAILED,
  LASTFM_ERROR.SERVICE_OFFLINE,
  LASTFM_ERROR.SERVICE_UNAVAILABLE,
  LASTFM_ERROR.RATE_LIMITED,
]);

/**
 * Whether a failed submission can never succeed and should be dropped rather
 * than pinning the queue.
 *
 * An error we don't recognise — including a transport failure with no Last.fm
 * code at all — is treated as transient: dropping a play we could have kept is
 * worse than one more attempt, and the retry cap bounds it either way.
 */
export const isPermanentLastFmError = (error: unknown): boolean => {
  const code = lastFmErrorCode(error);
  if (code === undefined) return false;
  return !TRANSIENT_CODES.has(code);
};
