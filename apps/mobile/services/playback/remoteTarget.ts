import type { PlaybackSnapshot } from "@/hooks/player/playbackSnapshot";

// Playback that happens somewhere other than this device's audio engine: the
// Subsonic jukebox, a UPnP/DLNA renderer. They all share the same shape — the
// app keeps owning the queue and the metadata, while transport commands and the
// reported position come from elsewhere.
//
// This exists so `services/player.ts` and `playbackSnapshot.ts` ask "is anything
// playing remotely?" once, instead of growing another `if (thisTarget.active)`
// branch per target across a dozen call sites. Everything downstream that reads
// `getPlaybackSnapshot()` or calls into `player.ts` — the lock screen, the
// widget, Android Auto, the floating player — follows a new target for free.
export type RemoteTarget = {
  id: string;
  isActive: () => boolean;

  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  getCurrentTime: () => number;
  isPlaying: () => boolean;
  // 0..1. Absent when the target has no volume of its own (the local engine
  // has none either — device volume is the OS's business).
  setVolume?: (volume: number) => void;

  readSnapshot: () => PlaybackSnapshot;
  // Whether the position needs interpolating between this target's own updates.
  // A remote reports every 1-3s; a seek bar and synced lyrics need ~4 Hz.
  isInterpolating: () => boolean;
  // Fires whenever this target's playback state moves, so the snapshot can be
  // republished. Targets rebase their own interpolation here.
  subscribe: (onChange: () => void) => () => void;
};

const targets: RemoteTarget[] = [];
const changeListeners = new Set<() => void>();

// Targets register themselves from their own service module, which keeps this
// file free of imports and therefore out of the import cycle that
// player.ts <-> jukebox.ts already live in.
export function registerRemoteTarget(target: RemoteTarget) {
  if (targets.some((t) => t.id === target.id)) return;
  targets.push(target);
  target.subscribe(() => {
    for (const listener of changeListeners) listener();
  });
}

// The first active target, or null when playback belongs to this device.
// Targets are mutually exclusive in practice: activating one deactivates the
// others, since each hands over the current position on the way in and out.
export function activeRemoteTarget(): RemoteTarget | null {
  return targets.find((target) => target.isActive()) ?? null;
}

export function subscribeRemoteChange(callback: () => void) {
  changeListeners.add(callback);
  return () => {
    changeListeners.delete(callback);
  };
}
