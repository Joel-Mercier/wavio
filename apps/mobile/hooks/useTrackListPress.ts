import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import type { QueueSource } from "@/stores/queue";
import useTrackSelection from "@/stores/trackSelection";
import { childToTrack } from "@/utils/childToTrack";

/**
 * Returns a stable onPress callback for a track row inside a list.
 * The latest `trackList` is kept in a ref so the callback identity never
 * changes — which means TrackListItem props stay referentially stable across
 * unrelated re-renders. `source` records where the list was played from for
 * the player's "Playing from …" label and is kept in a ref for the same reason.
 *
 * It also publishes the list as the multi-select "select all" pool. On focus,
 * not on mount: stacked screens stay mounted, so a plain effect would leave the
 * pool owned by whichever screen rendered last rather than by the one the user
 * is looking at.
 */
export function useTrackListPress(
  trackList: Child[] | undefined | null,
  source?: QueueSource,
) {
  const ref = useRef(trackList);
  const sourceRef = useRef(source);
  useEffect(() => {
    ref.current = trackList;
  }, [trackList]);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const isFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      useTrackSelection.getState().setPool(ref.current ?? []);
      return () => {
        isFocusedRef.current = false;
        useTrackSelection.getState().setPool([]);
      };
    }, []),
  );
  // The list usually arrives after focus (it is a query result), so the pool has
  // to follow it rather than only being seeded once.
  useEffect(() => {
    if (!isFocusedRef.current) return;
    useTrackSelection.getState().setPool(trackList ?? []);
  }, [trackList]);

  return useCallback((index: number, track: Child) => {
    const list = ref.current;
    const src = sourceRef.current ?? null;
    if (list && list.length > 0) {
      playTracks(list.map(childToTrack), index, { source: src });
    } else {
      playTracks([childToTrack(track)], 0, { source: src });
    }
  }, []);
}
