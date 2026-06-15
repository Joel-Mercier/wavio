import { captureException, captureMessage } from "@sentry/react-native";
import { isNetworkNoise } from "@/services/errorReporting";

/**
 * Logs an error. In development it forwards to `console.error` so it shows up
 * in the Metro logs; in production it reports to Sentry instead of writing to
 * the (invisible) device console.
 *
 * Accepts the same loose argument shape as `console.error` — typically an
 * `Error` plus optional context strings, e.g. `logError("Failed to X:", err)`.
 *
 * Network noise (offline / unreachable / cancelled requests) is dropped in
 * production so transient connectivity failures don't bury real Issues. Use
 * `reportError` from `services/errorReporting` for tagged, grouped service-layer
 * reporting; `logError` remains the generic UI-layer logger.
 */
export function logError(...args: unknown[]): void {
  if (__DEV__) {
    console.error(...args);
    return;
  }

  const error = args.find((arg) => arg instanceof Error);
  const context = args.filter((arg) => arg !== error);

  if (args.some(isNetworkNoise)) return;

  if (error) {
    captureException(
      error,
      context.length ? { extra: { context } } : undefined,
    );
  } else {
    captureMessage(args.map((arg) => String(arg)).join(" "), "error");
  }
}
