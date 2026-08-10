// Every outbound request identifies the app. With no explicit header React
// Native's networking stack (and ExoPlayer's OkHttp data source) sends
// `okhttp/*`, and Android's native image/artwork loaders send `Dalvik/*` — both
// of which Cloudflare's managed bot rules score as automated traffic, so a
// server fronted by Cloudflare can answer a browser fine while rejecting the
// app, surfacing as "can't connect" with nothing wrong server-side. Verified
// against LRCLIB: `okhttp/*` earns a 520 and an absent agent a 403, where the
// same request answers 200 with an identifying agent.
//
// A leaf module on purpose. It used to live in services/network.ts, which pulls
// in the stores and (through them) config/i18n's zod locales — so merely wanting
// the app's name dragged that whole graph into an importer, which broke the
// module cycle documented in services/backend/probe.ts and made any jest suite
// touching an API client fail on the zod locale ESM.
//
// The native module is read through a guarded require rather than a static
// import for the same reason: `expo-application` throws at *import* time when
// its native module is absent (jest, and any JS-only context), and
// services/serverHeaders.ts — which nearly every image, download and playback
// path imports — must not become unloadable over a version string that already
// has a fallback.
function nativeApplicationVersion(): string {
  try {
    const Application = require("expo-application") as {
      nativeApplicationVersion?: string | null;
    };
    return Application.nativeApplicationVersion ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export const USER_AGENT = `Wavio/${nativeApplicationVersion()}`;
