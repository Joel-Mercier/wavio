import { useCallback, useEffect, useRef } from "react";
import {
  type SharedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import {
  getPlaybackSnapshot,
  subscribePlaybackProgress,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import { reconcileLyricsClock } from "@/utils/lyrics";

const MAX_FRAME_STEP_MS = 100;
const MAX_AHEAD_OF_REPORT_MS = 2000;

const lyricsPositionMs = (offsetMs: number) =>
  (getPlaybackSnapshot().currentTime ?? 0) * 1000 + offsetMs;

const isAdvancing = () => {
  const { playing, buffering } = getPlaybackSnapshot();
  return playing && !buffering;
};

// Playback position in lyric time, advanced every frame on the UI thread so a
// word fill moves smoothly between the ~4 Hz playback reports without any
// React render. The frame loop only runs while enabled and playing.
export function useLyricsClock(
  offsetMs: number,
  enabled: boolean,
): SharedValue<number> {
  const position = useSharedValue(0);
  const report = useSharedValue({ ms: 0, seq: 0 });
  const seenSeq = useSharedValue(0);
  const seqRef = useRef(0);

  const frame = useFrameCallback(
    useCallback(
      (info) => {
        "worklet";
        const { ms, seq } = report.value;
        const step = Math.min(
          info.timeSincePreviousFrame ?? 0,
          MAX_FRAME_STEP_MS,
        );
        let next = position.value + step;
        if (seq !== seenSeq.value) {
          seenSeq.value = seq;
          next = reconcileLyricsClock(next, ms);
        }
        position.value = Math.min(next, ms + MAX_AHEAD_OF_REPORT_MS);
      },
      [position, report, seenSeq],
    ),
    false,
  );

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const sync = () => {
      const ms = lyricsPositionMs(offsetMs);
      const advancing = isAdvancing();
      // A paused clock has no frames to reconcile in, so a seek lands directly.
      if (!advancing) position.value = ms;
      seqRef.current += 1;
      report.value = { ms, seq: seqRef.current };
      if (advancing !== running) {
        running = advancing;
        frame.setActive(advancing);
      }
    };
    position.value = lyricsPositionMs(offsetMs);
    sync();
    const unsubscribeProgress = subscribePlaybackProgress(sync);
    const unsubscribeState = subscribePlaybackState(sync);
    return () => {
      unsubscribeProgress();
      unsubscribeState();
      frame.setActive(false);
    };
  }, [enabled, offsetMs, frame, position, report]);

  return position;
}
