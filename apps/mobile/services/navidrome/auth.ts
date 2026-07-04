import axios from "axios";
import type { NavidromeAuthPayload } from "@/services/navidrome/types";
import { useAuthBase } from "@/stores/auth";

export const nativeLogin = async (
  url: string,
  username: string,
  password: string,
): Promise<NavidromeAuthPayload> => {
  const baseURL = url.replace(/\/+$/, "");
  const rsp = await axios
    .create({
      baseURL,
      headers: { "Content-Type": "application/json" },
    })
    .post<NavidromeAuthPayload>("/auth/login", { username, password });
  return rsp.data;
};

let reauthPromise: Promise<string | null> | null = null;

// Silently re-acquire the Navidrome native JWT from the stored credentials and
// update the auth store, returning the fresh token (or null if we can't — no
// credentials, or /auth/login failed). The native token expires on its own
// session timeout and is absent entirely for sessions created before it existed
// (pre-1.0.7 upgrades that never re-logged in), so native-API calls must be able
// to heal themselves. Concurrent callers share one in-flight login so a burst of
// 401s from parallel requests triggers a single /auth/login. Uses `nativeLogin`
// directly (its own axios instance), so a failure here never loops back through
// the native instance's 401 interceptor.
export const reauthenticateNavidrome = (): Promise<string | null> => {
  if (reauthPromise) return reauthPromise;
  reauthPromise = (async () => {
    const { url, username, password } = useAuthBase.getState();
    if (!url || !username || !password) return null;
    try {
      const payload = await nativeLogin(url, username, password);
      if (payload?.token && payload?.id) {
        useAuthBase.getState().setNavidromeSession({
          token: payload.token,
          userId: payload.id,
          isAdmin: !!payload.isAdmin,
        });
        return payload.token;
      }
      return null;
    } catch {
      return null;
    } finally {
      reauthPromise = null;
    }
  })();
  return reauthPromise;
};
