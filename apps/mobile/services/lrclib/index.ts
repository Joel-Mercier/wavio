import axios from "axios";
import * as Application from "expo-application";

// LRCLIB sits behind Cloudflare, whose rules reject the User-Agent React
// Native's networking stack sends by default: `okhttp/*` earns a 520 (verified
// against /api/get and /api/search — the same query answers 200 with an
// identifying agent) and an absent one a 403. Both look like the API being down
// while a browser on the same network works fine. Identify the app the way
// LRCLIB asks, matching services/musicbrainz.
const USER_AGENT = `Wavio/${Application.nativeApplicationVersion ?? "1.0.0"} ( https://github.com/Joel-Mercier/wavio )`;

const lrclibApiInstance = axios.create({
  baseURL: "https://lrclib.net",
  headers: {
    "Content-Type": "application/json",
    "Lrclib-Client": "wavio",
    "User-Agent": USER_AGENT,
  },
});

export default lrclibApiInstance;
