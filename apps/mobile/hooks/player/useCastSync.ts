import { useEffect, useRef } from "react";
import { useCastSession, useMediaStatus } from "react-native-google-cast";
import { streamUrl } from "@/services/backend/streaming";
import {
  getCurrentTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  play as playLocal,
  seekTo as seekLocal,
} from "@/services/player";
import {
  isPodcastTrack,
  recordPodcastProgress,
} from "@/services/podcastProgress";
import type { QueueTrack } from "@/stores/queue";
import { podcastStreamUrl } from "@/utils/podcastEpisodeToTrack";

// What the receiver should fetch. Three sources, three answers: internet radio
// streams its own absolute URL, a podcast episode streams a third-party
// enclosure or the server's podcast stream endpoint (never
// `streamUrl(episode id)` — a Taddy uuid means nothing to the server, and an
// OpenSubsonic episode streams through its `streamId`, not its own id), and a
// library track streams from the Subsonic endpoint for its id.
function castContentUrl(
  track: QueueTrack,
  isRadio: boolean,
): string | undefined {
  if (isRadio) return track.streamUrl ?? track.url;
  if (isPodcastTrack(track)) return podcastStreamUrl(track);
  return streamUrl(track.id);
}

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
  // The track itself, not just its id: recording the outgoing episode when the
  // user skips while casting needs its duration and podcast-ness too.
  const lastCastTrackRef = useRef<QueueTrack | null>(null);

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
        const contentUrl = castContentUrl(playingTrack, isRadio);
        if (contentUrl) {
          lastCastTrackRef.current = playingTrack;
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
      lastCastTrackRef.current = null;
      // Nothing plays locally while casting, so the status listener records no
      // podcast progress — the receiver's last position is the only record of
      // what was listened to. Handing it to recordPodcastProgress also applies
      // the end guard, which is the sole way an episode played to completion on
      // the receiver is ever marked finished: no local didJustFinish fires, so
      // the entry would otherwise keep its pre-cast position forever.
      if (playingTrack && isPodcastTrack(playingTrack) && resumePos > 0) {
        recordPodcastProgress(playingTrack, resumePos, {
          duration: playingTrack.duration,
          force: true,
        });
      }
      if (!isRadio && resumePos > 0) seekLocal(resumePos);
      if (wasPlayingBeforeCastRef.current) playLocal();
      wasPlayingBeforeCastRef.current = false;
      lastReceiverPositionRef.current = 0;
    }
  }, [castSession, castClient, playingTrack, isRadio]);

  useEffect(() => {
    if (!castClient || !castSession || !playingTrack) return;
    if (lastCastTrackRef.current?.id === playingTrack.id) return;
    // Skipping while casting is the track-change twin of the session-end case:
    // the receiver's last position belongs to the *outgoing* episode and is
    // about to be replaced by the new one's. Recorded before the contentUrl
    // guard below, so an unplayable incoming track can't cost the outgoing
    // episode its position.
    const outgoing = lastCastTrackRef.current;
    const outgoingPosition = lastReceiverPositionRef.current;
    if (outgoing && isPodcastTrack(outgoing) && outgoingPosition > 0) {
      recordPodcastProgress(outgoing, outgoingPosition, {
        duration: outgoing.duration,
        force: true,
      });
      lastReceiverPositionRef.current = 0;
    }
    const contentUrl = castContentUrl(playingTrack, isRadio);
    if (!contentUrl) return;
    lastCastTrackRef.current = playingTrack;
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
