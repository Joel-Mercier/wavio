// Wavio's own Last.fm API account, injected at build time from the EAS
// environment (see CLAUDE.md → Environment variables).
//
// Last.fm has no OAuth2 and no PKCE: every signed request is authenticated by an
// md5 of the parameters plus a *shared secret*, which therefore has to be on the
// device. Being `EXPO_PUBLIC_` it is extractable from a shipped APK — that is
// inherent to the API's design, not an oversight, and every Last.fm client ships
// one the same way. EAS scoping keeps it out of git and CI logs; it cannot make
// a client-embedded secret truly secret.
export const LASTFM_API_KEY = process.env.EXPO_PUBLIC_LASTFM_API_KEY || "";
export const LASTFM_API_SECRET =
  process.env.EXPO_PUBLIC_LASTFM_API_SECRET || "";

export const LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/";
export const LASTFM_AUTH_URL = "https://www.last.fm/api/auth/";
export const LASTFM_SETTINGS_URL = "https://www.last.fm/settings/applications";

/**
 * Whether this build carries API credentials at all. A build made without them
 * can't reach Last.fm, so the settings screen says so instead of failing at the
 * first request with an opaque error 10 / 13.
 */
export const hasLastFmCredentials = (): boolean =>
  LASTFM_API_KEY.length > 0 && LASTFM_API_SECRET.length > 0;
