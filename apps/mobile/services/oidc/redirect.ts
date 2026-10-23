// A leaf on purpose: app/+native-intent.ts runs on every deep link at startup
// and only needs to recognise the callback, not load the sign-in machinery.

const REDIRECT_PATH = "oauth/callback";

// Guarded like utils/userAgent.ts: expo-application throws at import wherever
// its native module is absent (jest). The real id always wins on a device.
function applicationId(): string {
  try {
    const Application = require("expo-application") as {
      applicationId?: string | null;
    };
    return Application.applicationId ?? "com.jmercier.wavio";
  } catch {
    return "com.jmercier.wavio";
  }
}

/**
 * RFC 8252 §7.1 private-use redirect: the reverse-DNS application id, so the
 * dev, preview and store builds — installed side by side — each receive only
 * their own callback. The shared `wavio://` scheme would raise an Android app
 * chooser between them mid-sign-in.
 */
export function oidcRedirectUri(): string {
  return `${applicationId()}:/${REDIRECT_PATH}`;
}

// Matches the full URL and the bare path alike: Expo Router hands
// +native-intent either, depending on whether the app was already running.
const REDIRECT_PATTERN = new RegExp(`(?:^|[:/])/?${REDIRECT_PATH}(?:[/?#]|$)`);

export function isOidcRedirect(url: string): boolean {
  return REDIRECT_PATTERN.test(url);
}
