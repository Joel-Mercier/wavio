import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

// setTimeout / setInterval for anything that has to keep running while the app
// is in the background. RN fires its timers from Choreographer frames, which
// stop once the Activity is backgrounded: measured on Android with audio
// playing and with a car connected, JS timers froze until the UI reopened.
// These are driven by a native Handler message instead (modules/car-auto),
// falling back to JS timers where that module doesn't exist (iOS, tests).
//
// Meant for low-frequency work (deadlines, backoffs, debounces, polls); each
// arm is a native call plus an event.

type NativeTimers = {
  postDelayed: (id: number, delayMs: number) => void;
  cancelDelayed: (id: number) => void;
  addListener: (
    event: "delayElapsed",
    listener: (e: Record<string, unknown>) => void,
  ) => { remove: () => void };
};

export type BackgroundTimer = number;

type Entry = {
  fn: () => void;
  intervalMs: number | null;
  jsTimer: ReturnType<typeof setTimeout> | null;
};

let native: NativeTimers | null | undefined;
const entries = new Map<BackgroundTimer, Entry>();
let lastHandle = 0;

function nativeTimers(): NativeTimers | null {
  if (native !== undefined) return native;
  native =
    Platform.OS === "android"
      ? (requireOptionalNativeModule<NativeTimers>("CarAuto") ?? null)
      : null;
  native?.addListener("delayElapsed", (event) => {
    const id = event?.id;
    if (typeof id === "number") fire(id);
  });
  return native;
}

function arm(handle: BackgroundTimer, entry: Entry, ms: number) {
  const timers = nativeTimers();
  if (timers) {
    timers.postDelayed(handle, ms);
  } else {
    entry.jsTimer = setTimeout(() => fire(handle), ms);
  }
}

function fire(handle: BackgroundTimer) {
  const entry = entries.get(handle);
  if (!entry) return;
  if (entry.intervalMs == null) {
    entries.delete(handle);
  } else {
    // Re-armed before running, so a callback that clears its own interval
    // cancels the next tick rather than racing it.
    arm(handle, entry, entry.intervalMs);
  }
  entry.fn();
}

function start(
  fn: () => void,
  ms: number,
  intervalMs: number | null,
): BackgroundTimer {
  const handle = ++lastHandle;
  const entry: Entry = { fn, intervalMs, jsTimer: null };
  entries.set(handle, entry);
  arm(handle, entry, ms);
  return handle;
}

export function setBackgroundTimeout(
  fn: () => void,
  ms: number,
): BackgroundTimer {
  return start(fn, ms, null);
}

export function setBackgroundInterval(
  fn: () => void,
  ms: number,
): BackgroundTimer {
  return start(fn, ms, ms);
}

export function clearBackgroundTimer(
  handle: BackgroundTimer | null | undefined,
): void {
  if (handle == null) return;
  const entry = entries.get(handle);
  if (!entry) return;
  entries.delete(handle);
  if (entry.jsTimer != null) {
    clearTimeout(entry.jsTimer);
  } else {
    nativeTimers()?.cancelDelayed(handle);
  }
}

export function backgroundSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setBackgroundTimeout(resolve, ms);
  });
}
