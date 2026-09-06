import axios from "axios";
import * as Application from "expo-application";
import { LASTFM_API_KEY, LASTFM_API_ROOT } from "@/services/lastFm/config";

// Last.fm is a third-party service, not the music server, so it gets its own
// axios instance: the OpenSubsonic/Jellyfin instances inject server credentials
// and log the session out on an auth failure, neither of which may ever happen
// because a Last.fm session key was revoked.
//
// Last.fm's terms ask for an identifying User-Agent ("This helps our logging and
// reduces the risk of you getting banned"), and RN's default `okhttp/*` is the
// same one Cloudflare-fronted APIs reject — see services/listenBrainz/index.ts.
const USER_AGENT = `Wavio/${Application.nativeApplicationVersion ?? "1.0.0"} ( https://github.com/Joel-Mercier/wavio )`;

const lastFmApiInstance = axios.create({
  baseURL: LASTFM_API_ROOT,
  timeout: 15000,
  headers: { "User-Agent": USER_AGENT },
});

// `api_key` and `format` are on every single call, signed or not. `format` is
// deliberately *not* part of api_sig (see services/lastFm/signature.ts) — it is
// added here, after the caller has signed, so the two can never disagree.
lastFmApiInstance.interceptors.request.use((request) => {
  request.params = { ...request.params, format: "json" };
  if (request.method?.toLowerCase() === "get") {
    request.params.api_key = LASTFM_API_KEY;
  }
  return request;
});

export default lastFmApiInstance;
