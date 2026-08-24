import axios from "axios";
import * as Application from "expo-application";
import {
  LISTENBRAINZ_DEFAULT_BASE_URL,
  useListenBrainzBase,
} from "@/stores/listenBrainz";

// ListenBrainz is a third-party service, not the music server, so it gets its
// own axios instance: the OpenSubsonic/Jellyfin instances inject server
// credentials and log the session out on an auth failure, neither of which may
// ever happen because a ListenBrainz token went stale.
//
// api.listenbrainz.org sits behind Cloudflare, which rejects the `okhttp/*`
// User-Agent React Native sends by default — same failure mode as LRCLIB and
// MusicBrainz (see services/lrclib/index.ts).
const USER_AGENT = `Wavio/${Application.nativeApplicationVersion ?? "1.0.0"} ( https://github.com/Joel-Mercier/wavio )`;

const listenBrainzApiInstance = axios.create({
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  },
});

listenBrainzApiInstance.interceptors.request.use((request) => {
  const { baseUrl, token } = useListenBrainzBase.getState();
  // validateToken authenticates a token *and* a server the user just typed,
  // neither of which is in the store yet, so it passes both explicitly — a
  // caller-supplied baseURL/Authorization always wins over the stored one.
  request.baseURL = (
    request.baseURL ||
    baseUrl ||
    LISTENBRAINZ_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  if (!request.headers.has("Authorization") && token) {
    request.headers.set("Authorization", `Token ${token}`);
  }
  return request;
});

export default listenBrainzApiInstance;
