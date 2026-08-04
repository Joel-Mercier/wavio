import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  getWaveformEntry,
  requestWaveform,
  subscribeWaveforms,
  type WaveformEntry,
} from "@/services/waveform";
import type { QueueTrack } from "@/stores/queue";

const IDLE: WaveformEntry = { status: "idle", peaks: null, durationMs: 0 };

/**
 * The cached waveform for a track, generating it on first use.
 *
 * Mounting this hook is what marks a track as worth analyzing: the service
 * ref-counts subscribers and abandons work for tracks nobody is showing any
 * more, so skipping quickly through a queue doesn't decode every track along
 * the way.
 */
export function useWaveform(track: QueueTrack | null): WaveformEntry {
  const id = track?.id ?? null;
  // Read through a ref so a re-created queue object for the same track doesn't
  // re-register interest — everything the service reads off the track (id,
  // isRadio, source, duration) is fixed for a given id.
  const trackRef = useRef(track);
  trackRef.current = track;

  useEffect(() => {
    if (!id) return;
    const current = trackRef.current;
    if (!current) return;
    return requestWaveform(current);
  }, [id]);

  return useSyncExternalStore(
    subscribeWaveforms,
    () => (id ? getWaveformEntry(id) : IDLE),
    () => IDLE,
  );
}
