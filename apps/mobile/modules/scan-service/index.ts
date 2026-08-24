import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Holds the process alive while a library scan runs (Android only).
 *
 * A first scan of a network share is minutes of work; without this, backgrounding
 * the app suspends the JS context and the scan stops partway. There is no iOS
 * counterpart — iOS gives no equivalent guarantee for arbitrary background work —
 * so on iOS these are no-ops and a scan interrupted by backgrounding is picked up
 * by the foreground resume instead (see services/local/mediaLibraryScanning).
 *
 * `Native` is null on iOS, on web, and in Expo Go, so every call is guarded.
 */
type ScanServiceModule = {
  start(title: string, text: string): boolean;
  stop(): boolean;
};

const Native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<ScanServiceModule>("ScanService")
    : null;

export const isScanServiceAvailable = (): boolean => Native != null;

/**
 * Show the ongoing scan notification and keep the process alive.
 *
 * Never throws: failing to acquire the foreground guarantee is not a reason to
 * refuse to scan — it only means the scan may not survive backgrounding, which
 * is exactly the situation on iOS anyway.
 */
export function startScanService(title: string, text: string): void {
  try {
    Native?.start(title, text);
  } catch {
    // Ignored by design; see above.
  }
}

export function stopScanService(): void {
  try {
    Native?.stop();
  } catch {
    // Ignored by design; see above.
  }
}
