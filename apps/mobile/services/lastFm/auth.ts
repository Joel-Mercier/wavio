import * as WebBrowser from "expo-web-browser";
import { callSigned } from "@/services/lastFm/client";
import { LASTFM_API_KEY, LASTFM_AUTH_URL } from "@/services/lastFm/config";
import { isTokenNotAuthorized } from "@/services/lastFm/errors";
import { useLastFmBase } from "@/stores/lastFm";

type TokenResponse = { token?: string };
type SessionResponse = { session?: { name?: string; key?: string } };

// No "failed" variant: a transport or credential failure throws, so the caller
// distinguishes "the user didn't approve" (recoverable, offer a retry) from
// "something broke" (a toast) with a try/catch rather than a third branch.
export type ConnectResult =
  | { status: "connected"; userName: string }
  | { status: "notAuthorized" };

/**
 * Step 1 of the handshake: an unauthorised request token, valid for 60 minutes
 * and consumed by the getSession call below.
 */
const requestToken = async (): Promise<string> => {
  const rsp = await callSigned<TokenResponse>(
    "auth.getToken",
    {},
    { sessionKey: null },
  );
  if (!rsp.token) throw new Error("Last.fm returned no request token");
  return rsp.token;
};

/**
 * Step 3: trade an approved token for a session key. Session keys have no
 * expiry — the user revokes them at last.fm/settings/applications.
 */
const exchangeToken = async (
  token: string,
): Promise<{ userName: string; sessionKey: string }> => {
  const rsp = await callSigned<SessionResponse>(
    "auth.getSession",
    { token },
    { sessionKey: null },
  );
  const userName = rsp.session?.name;
  const sessionKey = rsp.session?.key;
  if (!userName || !sessionKey) {
    throw new Error("Last.fm returned an incomplete session");
  }
  return { userName, sessionKey };
};

/**
 * The whole sign-in: get a token, let the user approve it on last.fm in a
 * browser, then exchange it.
 *
 * There is deliberately no `cb` parameter and no deep link back into the app.
 * Last.fm's API-account form rejects a custom scheme like `wavio://` outright
 * ("invalid url"), so a redirect can never reach us, and Wavio has no https
 * property to bridge through. The browser therefore never returns on its own and
 * `dismiss` is the *normal* outcome — whatever closes it, we go on to exchange
 * the token. If the user backed out without approving, Last.fm answers error 14
 * and the caller offers a retry rather than an error.
 */
export const connectLastFm = async (): Promise<ConnectResult> => {
  const token = await requestToken();

  await WebBrowser.openAuthSessionAsync(
    `${LASTFM_AUTH_URL}?api_key=${encodeURIComponent(LASTFM_API_KEY)}&token=${encodeURIComponent(token)}`,
  );

  try {
    const { userName, sessionKey } = await exchangeToken(token);
    useLastFmBase.getState().setSession({ sessionKey, userName });
    return { status: "connected", userName };
  } catch (error) {
    if (isTokenNotAuthorized(error)) return { status: "notAuthorized" };
    throw error;
  }
};

export const disconnectLastFm = (): void => {
  useLastFmBase.getState().clearConfig();
};
