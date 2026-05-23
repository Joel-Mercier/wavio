import { useCallback, useEffect, useRef } from "react";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { childToTrack } from "@/utils/childToTrack";

/**
 * Returns a stable onPress callback for a track row inside a list.
 * The latest `trackList` is kept in a ref so the callback identity never
 * changes — which means TrackListItem props stay referentially stable across
 * unrelated re-renders.
 */
export function useTrackListPress(trackList: Child[] | undefined | null) {
  const ref = useRef(trackList);
  useEffect(() => {
    ref.current = trackList;
  }, [trackList]);
  return useCallback((index: number, track: Child) => {
    const list = ref.current;
    if (list && list.length > 0) {
      playTracks(list.map(childToTrack), index);
    } else {
      playTracks([childToTrack(track)], 0);
    }
  }, []);
}
