import axios from "axios";

/**
 * React Query `retry` predicate for third-party HTTP services.
 *
 * A 4xx is a verdict on the request itself — the feature is disabled, the
 * credential is rejected, the id is unknown — so repeating it verbatim can only
 * produce the same answer. Retries stay on for everything else, where a second
 * attempt is genuinely worth making.
 */
export function retryUnlessClientError(failureCount: number, error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    if (status >= 400 && status < 500) return false;
  }
  return failureCount < 2;
}
