import "expo-router/entry";
// Answers the OS's daily auto-backup slot. Wired here because the slot can boot
// the JS runtime with no UI, the same way a car does.
import { startAutoBackupScheduler } from "./services/autoBackup";
// Wires Android Auto / CarPlay outside of React, so a headless boot (Android
// Auto binding the media service with the app closed) still answers taps.
// Guarded: this runs during entry-module evaluation, where an uncaught throw
// takes the whole app down — including for users who never open the car.
import { startCarAutoSession } from "./services/carAuto/session";
// Keeps the shortcuts store's Favorites pin in step with the setting before any
// rehydrate, headless car boot included.
import { startHomeShortcutsSync } from "./services/homeShortcuts";
// Keeps a single-sign-on session's access token fresh ahead of expiry while
// anything might use it — a headless car boot plays through the proxy too.
import { startOidcRefreshScheduler } from "./services/oidc/refreshScheduler";
// Keeps the OS media controls pointed at whatever owns playback. Wired here
// rather than from a screen for the same reason: a headless boot has no React
// tree, and a remote session restored at launch still has to claim the controls.
import { startLockScreenMirror } from "./services/playback/lockScreenMirror";
// Decides when the unreachable-server recovery poll may run (foreground,
// playing, or a car connected) — including on a headless car boot.
import { startRecoveryPollGate } from "./services/recoveryPollGate";

try {
  startHomeShortcutsSync();
} catch (e) {
  console.warn("[shortcuts] failed to start favorites pin sync", e);
}

try {
  startCarAutoSession();
} catch (e) {
  console.warn("[carauto] failed to start session", e);
}

try {
  startLockScreenMirror();
} catch (e) {
  console.warn("[lockscreen] failed to start remote mirror", e);
}

try {
  startRecoveryPollGate();
} catch (e) {
  console.warn("[network] failed to start recovery poll gate", e);
}

try {
  startOidcRefreshScheduler();
} catch (e) {
  console.warn("[oidc] failed to start token refresh scheduler", e);
}

try {
  startAutoBackupScheduler();
} catch (e) {
  console.warn("[autoBackup] failed to start scheduler", e);
}
