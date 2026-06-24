import axios from "axios";
import { authenticateByName as jellyfinAuthenticate } from "@/services/jellyfin/auth";
import { nativeLogin } from "@/services/navidrome/auth";
import { openSubsonicErrorCodes } from "@/services/openSubsonic";
import {
  computeSubsonicToken,
  generateSalt,
} from "@/services/openSubsonic/auth";
import type { ServerType } from "@/stores/servers";

// Options object accepted by the auth store's `login()`. Produced here so both
// the login form and the silent server-switch screen share one authentication
// path. Backend-agnostic, hence it lives in services/ root rather than under a
// single backend dir.
export type RemoteLoginOptions = {
  serverType: ServerType;
  navidrome?: {
    token: string;
    userId: string;
    isAdmin: boolean;
  } | null;
  jellyfin?: {
    accessToken: string;
    userId: string;
    isAdmin: boolean;
  } | null;
  subsonicSalt?: string | null;
  subsonicToken?: string | null;
};

// Authenticate against a remote server and return the `login()` options. Does
// not touch any store, so callers stay in control of when the session flips to
// authenticated. Throws on failure (bad credentials, unreachable server).
export async function authenticateRemote(
  type: ServerType,
  url: string,
  username: string,
  password: string,
): Promise<RemoteLoginOptions> {
  const trimmedUrl = url.trim();
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();

  if (type === "jellyfin") {
    const payload = await jellyfinAuthenticate(
      trimmedUrl,
      trimmedUsername,
      trimmedPassword,
    );
    return {
      serverType: "jellyfin",
      jellyfin: {
        accessToken: payload.AccessToken,
        userId: payload.User.Id,
        isAdmin: !!payload.User.Policy?.IsAdministrator,
      },
    };
  }

  if (type === "local") {
    throw new Error("authenticateRemote does not support local libraries");
  }

  const subsonicSalt = generateSalt();
  const subsonicToken = await computeSubsonicToken(
    trimmedPassword,
    subsonicSalt,
  );
  const rsp = await axios
    .create({
      baseURL: trimmedUrl,
      headers: { "Content-Type": "application/json" },
    })
    .get("/rest/ping", {
      params: {
        u: trimmedUsername,
        t: subsonicToken,
        s: subsonicSalt,
        v: process.env.EXPO_PUBLIC_OPENSUBSONIC_API_VERSION,
        c: process.env.EXPO_PUBLIC_CLIENT_NAME,
        f: "json",
      },
    });
  if (rsp.data["subsonic-response"]?.status !== "ok") {
    throw new Error(
      openSubsonicErrorCodes[rsp.data["subsonic-response"].error.code],
    );
  }

  let navidrome: RemoteLoginOptions["navidrome"] = null;
  if (type === "navidrome") {
    try {
      const payload = await nativeLogin(
        trimmedUrl,
        trimmedUsername,
        trimmedPassword,
      );
      if (payload?.token && payload?.id) {
        navidrome = {
          token: payload.token,
          userId: payload.id,
          isAdmin: !!payload.isAdmin,
        };
      }
    } catch (err) {
      console.warn(
        "[auth] Navidrome native /auth/login unavailable, falling back to Subsonic-only mode",
        err,
      );
    }
  }

  return {
    serverType: type,
    navidrome,
    subsonicSalt,
    subsonicToken,
  };
}
