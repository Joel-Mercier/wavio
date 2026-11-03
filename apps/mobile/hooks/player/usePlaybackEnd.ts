import { useEffect, useMemo, useState } from "react";
import { getPlaybackSnapshot } from "@/hooks/player/playbackSnapshot";
import { useIsPlaying } from "@/hooks/player/useIsPlaying";
import {
  audiobookChapterEndAt,
  bookTimeOf,
  isAudiobookTrack,
} from "@/services/audiobookPlayback";
import { getPlaybackRateFor } from "@/services/player";
import { isSleepTimerActive, useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";
import useJukebox from "@/stores/jukebox";
import useQueue, { type QueueTrack } from "@/stores/queue";
import {
  canFinishTrack,
  type PlaybackEnd,
  projectChapterStop,
  projectPlaybackEnd,
} from "@/utils/playbackEnd";

type QueueShape = {
  queue: QueueTrack[];
  currentIndex: number | null;
  repeatMode: "off" | "all" | "one";
  removePlayed: boolean;
};

function wallSeconds(track: QueueTrack | undefined): number | null {
  if (!track || track.isRadio || !((track.duration ?? 0) > 0)) return null;
  return (track.duration as number) / getPlaybackRateFor(track);
}

// Mirrors the order next() walks the queue in (stores/queue.ts).
function upcomingTracks({
  queue,
  currentIndex,
  repeatMode,
  removePlayed,
}: QueueShape & { currentIndex: number }): QueueTrack[] {
  if (repeatMode === "one") return [queue[currentIndex]];
  const after = queue.slice(currentIndex + 1);
  if (removePlayed) {
    return [...after, ...queue.slice(0, currentIndex).reverse()];
  }
  if (repeatMode === "all") {
    return [...after, ...queue.slice(0, currentIndex + 1)];
  }
  return after;
}

function useEverySecond(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

export type PlaybackEndProjector = {
  now: number;
  project: (until: number | null, finishTrack: boolean) => PlaybackEnd | null;
  // When the current track ends; null when it has no known end.
  projectTrackEnd: () => PlaybackEnd | null;
  // When the audiobook reaches `bookTime` (the playing chapter's end when
  // omitted); null when no chaptered audiobook is playing.
  projectChapterEnd: (bookTime?: number) => PlaybackEnd | null;
};

/** End of the chapter playing now, in book time, or null. */
export function currentChapterEnd(
  track: QueueTrack | null | undefined,
): { itemId: string; bookTime: number } | null {
  if (!isAudiobookTrack(track)) return null;
  const bookTime = audiobookChapterEndAt(
    track.audiobookItemId,
    bookTimeOf(track, getPlaybackSnapshot().currentTime ?? 0),
  );
  return bookTime == null ? null : { itemId: track.audiobookItemId, bookTime };
}

export function usePlaybackEndProjector(
  enabled: boolean,
): PlaybackEndProjector {
  const now = useEverySecond(enabled);
  const queue = useQueue((s) => s.queue);
  const currentIndex = useQueue((s) => s.currentIndex);
  const repeatMode = useQueue((s) => s.repeatMode);
  const shuffle = useQueue((s) => s.shuffle);
  const removePlayed = useQueue((s) => s.removePlayed);
  const endless = useApp((s) => s.endlessPlaybackEnabled);
  const playing = useIsPlaying();
  const jukeboxActive = useJukebox((s) => s.active);
  const podcastRate = useApp((s) => s.podcastPlaybackRate);
  const current = currentIndex != null ? queue[currentIndex] : undefined;

  // Ticks every second; the queue (up to MAX_QUEUE_TRACKS) only on edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: podcastRate is read through getPlaybackRateFor
  const upcoming = useMemo(
    () =>
      currentIndex == null
        ? []
        : upcomingTracks({ queue, currentIndex, repeatMode, removePlayed }).map(
            wallSeconds,
          ),
    [queue, currentIndex, repeatMode, removePlayed, podcastRate],
  );

  const currentRemaining = (): number | null => {
    if (!current || current.isRadio) return null;
    const { currentTime, duration } = getPlaybackSnapshot();
    const total = duration || current.duration || 0;
    if (!(total > 0)) return null;
    return Math.max(0, total - currentTime) / getPlaybackRateFor(current);
  };

  const project = (until: number | null, finishTrack: boolean) => {
    if (currentIndex == null || !current) return null;
    if (finishTrack && playing && until != null && isAudiobookTrack(current)) {
      const { audiobookItemId } = current;
      const chapterStop = projectChapterStop({
        now,
        until,
        bookTime: bookTimeOf(current, getPlaybackSnapshot().currentTime ?? 0),
        rate: getPlaybackRateFor(current),
        chapterEndAt: (bookTime) =>
          audiobookChapterEndAt(audiobookItemId, bookTime),
      });
      if (chapterStop) return chapterStop;
    }
    // next() checks repeat-one before removePlayed, so it loops either way.
    const loops =
      repeatMode === "one" || (repeatMode === "all" && !removePlayed);
    return projectPlaybackEnd({
      now,
      currentRemaining: currentRemaining(),
      upcoming,
      cycle: loops,
      cycleReordered: loops && repeatMode === "all" && shuffle,
      openEnded: endless && repeatMode === "off" && !current.isRadio,
      until,
      finishTrack:
        finishTrack && canFinishTrack(current, playing, jukeboxActive),
    });
  };

  const projectTrackEnd = () => {
    const remaining = currentRemaining();
    return remaining == null
      ? null
      : { at: now + remaining * 1000, approximate: false };
  };

  const projectChapterEnd = (bookTime?: number) => {
    if (!isAudiobookTrack(current)) return null;
    const target = bookTime ?? currentChapterEnd(current)?.bookTime;
    if (target == null) return null;
    const position = bookTimeOf(
      current,
      getPlaybackSnapshot().currentTime ?? 0,
    );
    const remaining =
      Math.max(0, target - position) / getPlaybackRateFor(current);
    return { at: now + remaining * 1000, approximate: false };
  };

  return { now, project, projectTrackEnd, projectChapterEnd };
}

function useSleepTimerState() {
  const active = useSleepTimer(isSleepTimerActive);
  const endsAt = useSleepTimer((s) => s.endsAt);
  const endOfTrack = useSleepTimer((s) => s.endOfTrack);
  const finishing = useSleepTimer((s) => s.finishing);
  const chapterEnd = useSleepTimer((s) => s.chapterEnd);
  const finishTrack = useApp((s) => s.sleepTimerFinishTrack);
  return { active, endsAt, endOfTrack, finishing, chapterEnd, finishTrack };
}

function projectSleepEnd(
  { project, projectTrackEnd, projectChapterEnd }: PlaybackEndProjector,
  {
    endsAt,
    endOfTrack,
    chapterEnd,
    finishTrack,
  }: ReturnType<typeof useSleepTimerState>,
): PlaybackEnd | null {
  if (chapterEnd) return projectChapterEnd(chapterEnd.bookTime);
  if (endOfTrack) return projectTrackEnd();
  return endsAt != null ? project(endsAt, finishTrack) : null;
}

export function useSleepTimerEnd() {
  const timer = useSleepTimerState();
  const projector = usePlaybackEndProjector(timer.active);
  return { ...timer, end: projectSleepEnd(projector, timer) };
}

// When the queue runs dry — or the sleep timer stops it first.
export function useQueueEnd(enabled: boolean) {
  const timer = useSleepTimerState();
  const projector = usePlaybackEndProjector(enabled);
  const { now, project } = projector;
  if (!enabled) return { now, end: null, bySleepTimer: false };
  const queueEnd = project(null, false);
  const sleepEnd = projectSleepEnd(projector, timer);
  const bySleepTimer =
    sleepEnd != null && (queueEnd == null || sleepEnd.at < queueEnd.at);
  return { now, end: bySleepTimer ? sleepEnd : queueEnd, bySleepTimer };
}
