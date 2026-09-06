import lastFmApiInstance from "@/services/lastFm";
import { LASTFM_API_KEY } from "@/services/lastFm/config";
import { LastFmApiError } from "@/services/lastFm/errors";
import {
  compactParams,
  type LastFmParams,
  signParams,
} from "@/services/lastFm/signature";
import { useLastFmBase } from "@/stores/lastFm";

type ErrorBody = { error?: number; message?: string };

/**
 * Last.fm answers a rejected request with HTTP 200 and an `error` code in the
 * body about as often as with a real status, so every response goes through
 * here before a caller sees it.
 */
const unwrap = <T>(data: T & ErrorBody): T => {
  if (typeof data?.error === "number") {
    throw new LastFmApiError(data.error, data.message ?? "");
  }
  return data;
};

/**
 * A read method (`user.*`, `artist.getSimilar`, `track.getInfo`, …). These take
 * `api_key` alone — no session key, no signature — so they work for any
 * username, connected or not, and must never be handed the session key.
 */
export const callRead = async <T>(
  method: string,
  params: LastFmParams = {},
  options?: { signal?: AbortSignal },
): Promise<T> => {
  const rsp = await lastFmApiInstance.get<T & ErrorBody>("", {
    params: { method, ...compactParams(params) },
    signal: options?.signal,
  });
  return unwrap(rsp.data);
};

/**
 * A signed write method (`track.scrobble`, `track.love`, `auth.*`). POSTed as
 * `application/x-www-form-urlencoded`, which is what Last.fm expects and what
 * keeps a 50-track scrobble batch off the URL.
 *
 * `sessionKey` is passed rather than read from the store because the auth
 * handshake signs `auth.getSession` before any session key exists.
 */
export const callSigned = async <T>(
  method: string,
  params: LastFmParams = {},
  options?: { sessionKey?: string | null; signal?: AbortSignal },
): Promise<T> => {
  const sk =
    options?.sessionKey === undefined
      ? useLastFmBase.getState().sessionKey
      : options.sessionKey;

  const signable = compactParams({
    ...params,
    method,
    api_key: LASTFM_API_KEY,
    ...(sk ? { sk } : {}),
  });
  const api_sig = await signParams(signable);

  const rsp = await lastFmApiInstance.post<T & ErrorBody>(
    "",
    new URLSearchParams({ ...signable, api_sig }).toString(),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: options?.signal,
    },
  );
  return unwrap(rsp.data);
};
