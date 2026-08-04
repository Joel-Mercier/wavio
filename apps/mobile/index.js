import "expo-router/entry";
// Wires Android Auto / CarPlay outside of React, so a headless boot (Android
// Auto binding the media service with the app closed) still answers taps.
// Guarded: this runs during entry-module evaluation, where an uncaught throw
// takes the whole app down — including for users who never open the car.
import { startCarAutoSession } from "./services/carAuto/session";

try {
  startCarAutoSession();
} catch (e) {
  console.warn("[carauto] failed to start session", e);
}
