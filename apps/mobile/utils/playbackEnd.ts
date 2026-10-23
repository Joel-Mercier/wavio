// When playback will stop, given what is left of the current track, the tracks
// queued behind it and an optional sleep-timer deadline. Pure so the sleep timer
// sheet, the floating badge and the queue footer all agree on one answer.

export type PlaybackEndInput = {
  now: number;
  // Seconds of wall-clock time left in the current track (rate already applied),
  // or null when it has no known end (radio, a stream without a duration).
  currentRemaining: number | null;
  // Wall-clock seconds of each track that would play next, in order. null where
  // a track has no known duration.
  upcoming: (number | null)[];
  // `upcoming` plays again and again (repeat-one, repeat-all).
  cycle: boolean;
  // Repeated passes play the same tracks in a different order (shuffled
  // repeat-all), so a crossing found after the first pass is only an estimate.
  cycleReordered: boolean;
  // More tracks of unknown length follow `upcoming` (endless playback).
  openEnded: boolean;
  // Sleep-timer deadline (ms epoch).
  until: number | null;
  // Let the track playing at the deadline finish instead of stopping mid-song.
  finishTrack: boolean;
};

export type PlaybackEnd = { at: number; approximate: boolean };

// Whether an expiring sleep timer can let the current track play out. The
// jukebox advances on the server, so its track ends never reach the
// end-of-track hook; a track with no declared length has no end to wait for.
export function canFinishTrack(
  track: { isRadio?: boolean; duration?: number } | null | undefined,
  playing: boolean,
  playsOnServer: boolean,
): boolean {
  return (
    !playsOnServer &&
    playing &&
    !!track &&
    !track.isRadio &&
    (track.duration ?? 0) > 0
  );
}

export function projectPlaybackEnd(
  input: PlaybackEndInput,
): PlaybackEnd | null {
  const { now, currentRemaining, upcoming, until, finishTrack } = input;

  if (currentRemaining == null) {
    return until == null ? null : { at: until, approximate: false };
  }

  const cycleKnown = upcoming.reduce<number>((sum, d) => sum + (d ?? 0), 0);
  const cycles = input.cycle && cycleKnown > 0;

  if (until == null) {
    if (input.cycle || input.openEnded) return null;
    return {
      at: now + (currentRemaining + cycleKnown) * 1000,
      approximate: upcoming.some((d) => d == null),
    };
  }

  const crossing = (trackEnd: number, approximate: boolean): PlaybackEnd => ({
    at: finishTrack ? trackEnd : until,
    approximate: finishTrack && approximate,
  });

  let t = now + currentRemaining * 1000;
  let approximate = false;
  if (t >= until) return crossing(t, approximate);

  let pass = 0;
  do {
    if (pass > 0 && input.cycleReordered) approximate = true;
    for (const duration of upcoming) {
      if (duration == null) {
        approximate = true;
        continue;
      }
      t += duration * 1000;
      if (t >= until) return crossing(t, approximate);
    }
    pass += 1;
  } while (cycles);

  if (input.openEnded || input.cycle) {
    return { at: until, approximate: finishTrack };
  }
  return { at: t, approximate };
}
