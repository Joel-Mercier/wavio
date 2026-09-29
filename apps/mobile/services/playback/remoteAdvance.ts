import usePlaybackNotice from "@/stores/playbackNotice";
import useQueue, { type QueueTrack } from "@/stores/queue";

// What happens when a track ends somewhere other than this device, and what
// happens when the next one cannot be handed over. Shared by every remote target
// so a Cast receiver and a UPnP renderer never disagree about either.
//
// Repeat-one needs handling here rather than through the queue: `next()`
// deliberately keeps the same index, so a track-change subscription never fires
// and the receiver would simply sit silent at the end of the song.

type Handlers = {
  reload: (track: QueueTrack) => void;
  // End of the queue with nothing to repeat: leave the track loaded so the player
  // keeps its title, artist and cover the way it does when local playback runs
  // out, but stop the receiver.
  stop: () => void;
};

// Set by an automatic advance and consumed by the queue subscription that pushes
// the resulting track, so a load failure knows whether anyone asked for it.
let automaticAdvancePending = false;
// Automatic advances that failed in a row. One is skipped over — a single bad
// track must not stop an album playing while nobody is looking — but a second
// means something is wrong with the receiver, not the track.
let failedAutomaticAdvances = 0;

export function advanceAfterTrackEnd(handlers: Handlers) {
  const state = useQueue.getState();
  if (state.repeatMode === "one") {
    const current = state.getCurrent();
    if (current) handlers.reload(current);
    return;
  }
  if (atQueueTail(state)) {
    handlers.stop();
    return;
  }
  automaticAdvancePending = true;
  state.next();
}

// Past the last track with nothing to repeat, `next()` drops the current index
// altogether and the player has nothing left to show.
function atQueueTail(state: ReturnType<typeof useQueue.getState>): boolean {
  return (
    state.currentIndex == null ||
    (state.repeatMode === "off" &&
      !state.removePlayed &&
      state.currentIndex >= state.queue.length - 1)
  );
}

export function consumeAutomaticAdvance(): boolean {
  const automatic = automaticAdvancePending;
  automaticAdvancePending = false;
  return automatic;
}

export function noteRemoteLoadSucceeded() {
  failedAutomaticAdvances = 0;
}

/**
 * A track the receiver would not take.
 *
 * The queue is never rolled back: doing so re-enters the very subscriptions that
 * pushed the track, and a phone that jumps back to a song the listener just left
 * is the worse surprise. The receiver was stopped before the handover, so the
 * honest state is "this track, not playing" — say why, and let the listener pick
 * another. Only an advance nobody asked for is allowed to try the next one, once.
 */
export function handleRemoteLoadFailure(options: {
  automatic: boolean;
  deviceName: string;
  track: QueueTrack;
}): "skipped" | "held" {
  const queue = useQueue.getState();
  if (options.automatic && failedAutomaticAdvances < 1 && !atQueueTail(queue)) {
    failedAutomaticAdvances += 1;
    automaticAdvancePending = true;
    queue.next();
    return "skipped";
  }
  failedAutomaticAdvances = 0;
  usePlaybackNotice.getState().raise("REMOTE_TRACK_REFUSED", {
    name: options.deviceName,
    track: options.track.title ?? "",
  });
  return "held";
}

export function noticeRemoteLost(deviceName: string) {
  usePlaybackNotice.getState().raise("REMOTE_LOST", { name: deviceName });
}

export function resetRemoteAdvance() {
  automaticAdvancePending = false;
  failedAutomaticAdvances = 0;
}
