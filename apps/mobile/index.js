import "expo-router/entry";

// Android Auto / CarPlay and the Wear OS companion are wired outside of React,
// so a headless boot (Android Auto binding the media service with the app
// closed) still answers taps, and the watch keeps being mirrored after the app
// is swiped away with music playing.
//
// `require` inside the guard, not a top-level import: imports are hoisted and
// evaluated before either block runs, so a throw anywhere in one session's
// module tree would take the entry module down with it — the whole app, for
// users who own neither a car head unit nor a watch. Separately guarded so
// neither session can keep the other from starting.
try {
  require("./services/carAuto/session").startCarAutoSession();
} catch (e) {
  console.warn("[carauto] failed to start session", e);
}

try {
  require("./services/wear/session").startWearSession();
} catch (e) {
  console.warn("[wear] failed to start session", e);
}
