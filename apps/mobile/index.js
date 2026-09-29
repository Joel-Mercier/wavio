import "expo-router/entry";
// Wires Android Auto / CarPlay outside of React, so a headless boot (Android
// Auto binding the media service with the app closed) still answers taps.
// Guarded: this runs during entry-module evaluation, where an uncaught throw
// takes the whole app down — including for users who never open the car.
import { startCarAutoSession } from "./services/carAuto/session";
// Keeps the OS media controls pointed at whatever owns playback. Wired here
// rather than from a screen for the same reason: a headless boot has no React
// tree, and a remote session restored at launch still has to claim the controls.
import { startLockScreenMirror } from "./services/playback/lockScreenMirror";
// Decides when the unreachable-server recovery poll may run (foreground,
// playing, or a car connected) — including on a headless car boot.
import { startRecoveryPollGate } from "./services/recoveryPollGate";

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
