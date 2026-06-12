import { useEffect, useRef } from "react";
import { useCastSession, useMediaStatus } from "react-native-google-cast";
import {
  getCurrentTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  play as playLocal,
  seekTo as seekLocal,
} from "@/services/player";
import type { QueueTrack } from "@/stores/queue";
import { streamUrl } from "@/utils/streaming";

// Mirrors local playback onto an active Chromecast session: hands playback off
// when a session starts (resuming at the local position), reloads media on
// track change while casting, and resumes local playback at the receiver's
// last position when the session ends.
export function useCastSync(
  playingTrack: QueueTrack | null | undefined,
  isRadio: boolean,
) {
  const castSession = useCastSession();
  const castClient = castSession?.client ?? null;
  const castMediaStatus = useMediaStatus();
  const previousSessionIdRef = useRef<string | null>(null);
  const wasPlayingBeforeCastRef = useRef(false);
  const lastReceiverPositionRef = useRef(0);
  const lastLoadedCastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pos = castMediaStatus?.streamPosition;
    if (typeof pos === "number" && Number.isFinite(pos)) {
      lastReceiverPositionRef.current = pos;
    }
  }, [castMediaStatus?.streamPosition]);

  useEffect(() => {
    const currentSessionId = castSession?.id ?? null;
    const previousSessionId = previousSessionIdRef.current;
    if (currentSessionId === previousSessionId) return;
    previousSessionIdRef.current = currentSessionId;

    if (currentSessionId && !previousSessionId) {
      wasPlayingBeforeCastRef.current = isLocalPlaying();
      const localPos = getCurrentTime();
      pauseLocal();
      if (castClient && playingTrack) {
        const contentUrl = isRadio
          ? (playingTrack.streamUrl ?? playingTrack.url)
          : streamUrl(playingTrack.id);
        if (contentUrl) {
          lastLoadedCastTrackIdRef.current = playingTrack.id;
          castClient.loadMedia({
            autoplay: wasPlayingBeforeCastRef.current,
            startTime: isRadio ? undefined : localPos,
            mediaInfo: {
              contentUrl,
              contentType: "audio/mpeg",
              metadata: {
                type: "musicTrack",
                title: playingTrack.title,
                albumTitle: playingTrack.album,
                artist: playingTrack.artist,
                images: playingTrack.artwork
                  ? [{ url: playingTrack.artwork }]
                  : undefined,
              },
              streamDuration: playingTrack.duration,
            },
          });
        }
      }
    } else if (!currentSessionId && previousSessionId) {
      const resumePos = lastReceiverPositionRef.current;
      lastLoadedCastTrackIdRef.current = null;
      if (!isRadio && resumePos > 0) seekLocal(resumePos);
      if (wasPlayingBeforeCastRef.current) playLocal();
      wasPlayingBeforeCastRef.current = false;
      lastReceiverPositionRef.current = 0;
    }
  }, [castSession, castClient, playingTrack, isRadio]);

  useEffect(() => {
    if (!castClient || !castSession || !playingTrack) return;
    if (lastLoadedCastTrackIdRef.current === playingTrack.id) return;
    const contentUrl = isRadio
      ? (playingTrack.streamUrl ?? playingTrack.url)
      : streamUrl(playingTrack.id);
    if (!contentUrl) return;
    lastLoadedCastTrackIdRef.current = playingTrack.id;
    castClient.loadMedia({
      mediaInfo: {
        contentUrl,
        contentType: "audio/mpeg",
        metadata: {
          type: "musicTrack",
          title: playingTrack.title,
          albumTitle: playingTrack.album,
          artist: playingTrack.artist,
          images: playingTrack.artwork
            ? [{ url: playingTrack.artwork }]
            : undefined,
        },
        streamDuration: playingTrack.duration,
      },
    });
  }, [castClient, castSession, playingTrack, isRadio]);

  return castSession;
}
