import { isExpectedNoise, reportError } from "@/services/errorReporting";

// Serialize a non-Error arg for a synthesized message without producing a
// useless "[object Object]" — the failure mode we're specifically fixing here.
function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Logs an error. In development it forwards to `console.error` so it shows up
 * in the Metro logs; in production it routes through `reportError` (tagged
 * `area: "ui"`) so UI-layer logs get the same noise classifier, grouping tags
 * and cross-chokepoint dedupe as service-layer reporting.
 *
 * Accepts the same loose argument shape as `console.error` — typically an
 * `Error` plus optional context strings, e.g. `logError("Failed to X:", err)`.
 * When no `Error` is present the args are folded into a real `Error` (rather
 * than a bare `captureMessage`) so a plain object never lands in Sentry as
 * "[object Object]".
 *
 * Expected noise (offline / unreachable / cancelled requests, gateway 5xx, plus
 * typed control-flow / user-input errors) is dropped in production so it doesn't
 * bury real Issues. Use `reportError` directly from `services/errorReporting`
 * for tagged service-layer reporting with a specific backend/status.
 */
export function logError(...args: unknown[]): void {
  if (__DEV__) {
    console.error(...args);
    return;
  }

  // Suppress an expected non-Error arg (e.g. a Subsonic {code} object) that
  // wouldn't be the one `reportError` classifies below.
  if (args.some(isExpectedNoise)) return;

  const error = args.find((arg) => arg instanceof Error);
  const context = args.filter((arg) => arg !== error);
  const normalized =
    (error as Error | undefined) ??
    new Error(args.map(stringifyArg).join(" ") || "logError");

  reportError(normalized, {
    area: "ui",
    extra: context.length ? { context } : undefined,
  });
}
