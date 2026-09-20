import { NativeModules } from "react-native";
import {
  CastContext,
  type CastSession,
  MediaPlayerIdleReason,
  MediaPlayerState,
  type MediaStatus,
  MediaStreamType,
  RemoteMediaClient,
} from "react-native-google-cast";
import type { PlaybackSnapshot } from "@/hooks/player/playbackSnapshot";
import { streamUrl } from "@/services/backend/streaming";
import { reportError } from "@/services/errorReporting";
import { castMime } from "@/services/playback/castMime";
import {
  advanceAfterTrackEnd as advanceQueueAfterTrackEnd,
  consumeAutomaticAdvance,
  handleRemoteLoadFailure,
  noteRemoteLoadSucceeded,
  resetRemoteAdvance,
} from "@/services/playback/remoteAdvance";
import {
  activeRemoteTarget,
  registerRemoteTarget,
} from "@/services/playback/remoteTarget";
import { sameStreamUri } from "@/services/playback/streamUri";
import {
  getCurrentTime as getLocalTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  takeOverFromRemote,
} from "@/services/player";
import {
  isPodcastTrack,
  recordPodcastProgress,
} from "@/services/podcastProgress";
import { registerLogoutHandler } from "@/stores/auth";
import useCast, { useCastBase } from "@/stores/cast";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { podcastStreamUrl } from "@/utils/podcastEpisodeToTrack";

// Chromecast as an output, on the same footing as a UPnP renderer or the
// jukebox: the phone keeps the queue and the metadata, the receiver plays, and
// every transport call in services/player.ts lands here while a session is up.
//
// Wired at module scope, not from a component: the output sheet opens from the
// floating player too, and a session the SDK hands back on launch has to be
// picked up before any screen mounts. Only the hidden CastButton stays in the
// React tree, because Android's device picker can only be opened through one
// (components/player/CastController.tsx).
//
// Known limit: the library attaches its native SDK callbacks when an Activity
// resumes, so a session cannot be observed from a JS runtime booted with no UI
// (Android Auto cold start) until the app is opened once.

// Restart-vs-previous threshold, matching the local player's.
const RESTART_BEFORE_SECONDS = 3;

export const isCastActive = (): boolean => useCastBase.getState().active;

// ── What the receiver is told to fetch ───────────────────────────────────────

// Three sources, three answers: internet radio streams its own absolute URL, a
// podcast episode streams a third-party enclosure or the server's podcast stream
// endpoint (never `streamUrl(episode id)` — a Taddy uuid means nothing to the
// server, and an OpenSubsonic episode streams through its `streamId`, not its
// own id), and a library track streams from the Subsonic endpoint for its id.
function castContentUrl(track: QueueTrack): string | undefined {
  if (track.isRadio) return track.streamUrl ?? track.url;
  if (isPodcastTrack(track)) return podcastStreamUrl(track);
  return streamUrl(track.id);
}

// ── Playback state, as last reported by the receiver ─────────────────────────

let lastPositionSec = 0;
let lastDurationSec = 0;
let loading = false;
let wasPlaying = false;
let finishedFired = false;
// Numbers every load; a status about a load we have since replaced is dropped
// rather than mistaken for the current one ending. Carried to the receiver in
// the media's customData and handed back on every status update.
let currentGeneration = 0;
// Transport commands in flight: their outcome is applied optimistically and a
// status that could contradict them can only predate them.
let pendingCommands = 0;
// The receiver has unloaded the media (the track finished, someone else stopped
// it, it choked): there is nothing left to play, pause or seek in, so the next
// Play reloads the current track from `resumeAtSec` instead.
let receiverIdle = false;
let resumeAtSec: number | null = null;

let basePosition = 0;
let baseAt = Date.now();

const changeListeners = new Set<() => void>();

function notifyChange() {
  for (const listener of changeListeners) listener();
}

function rebase(position: number) {
  basePosition = position;
  baseAt = Date.now();
}

function interpolatedPosition(): number {
  const elapsed = wasPlaying ? (Date.now() - baseAt) / 1000 : 0;
  let position = basePosition + elapsed;
  if (lastDurationSec > 0) position = Math.min(position, lastDurationSec);
  return position;
}

function resetPlaybackState(positionSec: number, duration: number) {
  lastPositionSec = positionSec;
  lastDurationSec = duration;
  loading = true;
  wasPlaying = false;
  finishedFired = false;
  receiverIdle = false;
  resumeAtSec = null;
  rebase(positionSec);
}

// The receiver stopped with nothing loaded; hold the player where it was and
// remember it for the next Play.
function parkReceiver(positionSec: number) {
  receiverIdle = true;
  loading = false;
  wasPlaying = false;
  resumeAtSec = positionSec;
  lastPositionSec = positionSec;
  rebase(positionSec);
}

function trackIdOf(status: MediaStatus): string | undefined {
  const custom = status.mediaInfo?.customData as
    | { trackId?: unknown }
    | undefined;
  return typeof custom?.trackId === "string" ? custom.trackId : undefined;
}

// Whether a status the receiver already had when we joined describes the track
// this phone is on: our own customData when it is one of ours, the stream URL
// otherwise.
function describesTrack(status: MediaStatus, track: QueueTrack): boolean {
  const id = trackIdOf(status);
  if (id != null) return id === track.id;
  return sameStreamUri(status.mediaInfo?.contentUrl, castContentUrl(track));
}

function generationOf(status: MediaStatus): number | undefined {
  const custom = status.mediaInfo?.customData as
    | { generation?: unknown }
    | undefined;
  return typeof custom?.generation === "number" ? custom.generation : undefined;
}

function onMediaStatus(status: MediaStatus | null) {
  if (!isCastActive() || !status) return;
  const generation = generationOf(status);
  // A status about a track we have since replaced. One with no generation at
  // all was loaded by someone else — a session picked up on launch — and is
  // believed as long as we have loaded nothing ourselves.
  if (
    generation != null
      ? generation !== currentGeneration
      : currentGeneration !== 0
  )
    return;
  if (pendingCommands > 0) return;

  const position = status.streamPosition;
  const duration = status.mediaInfo?.streamDuration;
  if (
    typeof position === "number" &&
    Number.isFinite(position) &&
    position > 0
  ) {
    lastPositionSec = position;
  }
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    lastDurationSec = duration;
  }

  switch (status.playerState) {
    case MediaPlayerState.PLAYING:
      loading = false;
      wasPlaying = true;
      finishedFired = false;
      receiverIdle = false;
      resumeAtSec = null;
      rebase(lastPositionSec);
      // Only now is the load known to have worked: the receiver acknowledges a
      // LOAD long before it has fetched anything.
      noteRemoteLoadSucceeded();
      break;
    case MediaPlayerState.PAUSED:
      loading = false;
      wasPlaying = false;
      receiverIdle = false;
      resumeAtSec = null;
      rebase(lastPositionSec);
      break;
    case MediaPlayerState.BUFFERING:
    case MediaPlayerState.LOADING:
      loading = true;
      break;
    case MediaPlayerState.IDLE:
      if (status.idleReason === MediaPlayerIdleReason.FINISHED) {
        if (!finishedFired) {
          finishedFired = true;
          loading = false;
          wasPlaying = false;
          advanceAfterTrackEnd();
        }
      } else if (status.idleReason === MediaPlayerIdleReason.ERROR) {
        if (!finishedFired) {
          finishedFired = true;
          parkReceiver(interpolatedPosition());
          onReceiverError();
        }
      } else if (status.idleReason === MediaPlayerIdleReason.CANCELLED) {
        // Stopped from somewhere else — the receiver's own remote, another
        // sender, a voice assistant. We never send a stop ourselves, and our
        // own reloads arrive as "interrupted". The receiver reports position
        // zero here, so the clock we kept is the one worth holding.
        parkReceiver(interpolatedPosition());
      }
      // "interrupted" is our own next load: the queue already knows.
      break;
    default:
      break;
  }
  notifyChange();
}

function onProgress(progress: number, duration: number) {
  if (!isCastActive() || pendingCommands > 0) return;
  if (Number.isFinite(progress) && progress > 0) {
    lastPositionSec = progress;
    if (wasPlaying) rebase(progress);
  }
  if (Number.isFinite(duration) && duration > 0) lastDurationSec = duration;
  notifyChange();
}

function advanceAfterTrackEnd() {
  advanceQueueAfterTrackEnd({
    reload: (track) => {
      void loadOnReceiver(track, true, 0, { automatic: true });
    },
    stop: () => {
      // The receiver has already unloaded the track; keep it as the current one
      // so the player keeps its title, artist and cover, parked at the top the
      // way local playback ends up when the queue runs out.
      parkReceiver(0);
    },
  });
}

// The receiver could not fetch or decode the stream. Nobody pressed anything,
// so it is treated as an automatic advance that failed: the next track gets one
// try.
function onReceiverError() {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  handleRemoteLoadFailure({
    automatic: true,
    deviceName: useCastBase.getState().deviceName ?? "",
    track: current,
  });
}

// ── Session ──────────────────────────────────────────────────────────────────

let client: RemoteMediaClient | null = null;
let session: CastSession | null = null;
let statusSubscription: { remove: () => void } | null = null;
let progressSubscription: { remove: () => void } | null = null;
let queueUnsubscribe: (() => void) | null = null;
let lastPushedTrackId: string | null = null;
// The track the receiver was last given, for recording where a podcast got to
// when it is replaced or the session ends: nothing plays locally meanwhile, so
// the receiver's position is the only record of what was listened to.
let loadedTrack: QueueTrack | null = null;

// Set while a session is being taken over, so the SDK reporting the same
// session twice (started, then resumed) cannot run the takeover twice.
let activating = false;

async function onSessionStarted(started: CastSession) {
  if (isCastActive() || activating) return;
  activating = true;
  try {
    await takeOver(started);
  } finally {
    activating = false;
  }
}

async function takeOver(started: CastSession) {
  // Whatever is playing now — this device or another remote — is where the
  // receiver picks up. Another remote is released outright rather than handed
  // back here first: a hand-back would start the local engine for the moment
  // it takes the receiver to load, and pausing it would be sent to that remote
  // as a transport command.
  const other = activeRemoteTarget();
  const wasLocallyPlaying = isLocalPlaying();
  const position = getLocalTime();
  if (other) await other.release();
  else pauseLocal();

  session = started;
  const receiver = started.client ?? new RemoteMediaClient();
  client = receiver;
  currentGeneration = 0;
  pendingCommands = 0;
  loadedTrack = null;
  resetRemoteAdvance();
  resetPlaybackState(position, 0);
  loading = false;

  statusSubscription?.remove();
  statusSubscription = receiver.onMediaStatusUpdated(onMediaStatus);
  progressSubscription?.remove();
  progressSubscription = receiver.onMediaProgressUpdated(onProgress, 1);

  const store = useCastBase.getState();
  store.setSession(started.id ?? "session", store.deviceName);
  void started
    .getCastDevice()
    .then((device) => {
      if (device?.friendlyName)
        useCastBase.getState().setDeviceName(device.friendlyName);
    })
    .catch(() => {});
  void started
    .getVolume()
    .then((volume) => {
      if (typeof volume === "number") useCastBase.getState().setVolume(volume);
    })
    .catch(() => {});

  subscribeQueue();
  notifyChange();

  const current = useQueue.getState().getCurrent();
  if (!current) return;
  // A session picked up rather than started — the app was killed while
  // casting, the SDK resumed it on launch — may find the receiver still on the
  // track this phone is on. Then it stays the receiver's state, not the phone's
  // cold one: reloading would restart the song from the top.
  const existing = await receiver.getMediaStatus().catch(() => null);
  if (client !== receiver || !isCastActive()) return;
  if (existing && isMidTrack(existing) && describesTrack(existing, current)) {
    currentGeneration = generationOf(existing) ?? 0;
    loadedTrack = current;
    onMediaStatus(existing);
    return;
  }
  void loadOnReceiver(current, wasLocallyPlaying, position);
}

function isMidTrack(status: MediaStatus): boolean {
  switch (status.playerState) {
    case MediaPlayerState.PLAYING:
    case MediaPlayerState.PAUSED:
    case MediaPlayerState.BUFFERING:
    case MediaPlayerState.LOADING:
      return true;
    default:
      return false;
  }
}

// The SDK put the session on hold (iOS, going to the background). The receiver
// plays on; it is still our output, just not one we can talk to right now.
function onSessionSuspended() {
  if (!isCastActive()) return;
  useCastBase.getState().setSuspended(true);
  notifyChange();
}

function onSessionResumed(resumed: CastSession) {
  if (!isCastActive()) {
    void onSessionStarted(resumed);
    return;
  }
  session = resumed;
  useCastBase.getState().setSuspended(false);
  void client
    ?.getMediaStatus()
    .then((status) => onMediaStatus(status))
    .catch(() => {});
}

// Whatever ended the session — the user in the Cast dialog, the receiver going
// away, ourselves — playback continues here from where the receiver got to.
function onSessionEnded() {
  if (!isCastActive()) return;
  const position = interpolatedPosition();
  const shouldPlay = wasPlaying;
  recordOutgoingProgress(position);
  detach();
  takeOverFromRemote(position, shouldPlay);
}

function detach() {
  statusSubscription?.remove();
  statusSubscription = null;
  progressSubscription?.remove();
  progressSubscription = null;
  queueUnsubscribe?.();
  queueUnsubscribe = null;
  session = null;
  client = null;
  loadedTrack = null;
  wasPlaying = false;
  loading = false;
  receiverIdle = false;
  resumeAtSec = null;
  useCastBase.getState().setSession(null, null);
  notifyChange();
}

// Recording the outgoing episode also applies the end guard, which is the only
// way an episode played to completion on the receiver is ever marked finished:
// no local didJustFinish fires, so the entry would otherwise keep its pre-cast
// position forever.
function recordOutgoingProgress(position: number) {
  const outgoing = loadedTrack;
  if (outgoing && isPodcastTrack(outgoing) && position > 0) {
    recordPodcastProgress(outgoing, position, {
      duration: outgoing.duration,
      force: true,
    });
  }
}

/**
 * End the session and bring playback back to this device.
 *
 * The hand-back happens here, before the SDK confirms, so that whatever the
 * caller does next — hand playback to a renderer, say — starts from a phone
 * that already owns it; the SDK's own "ended" callback then finds nothing left
 * to do.
 */
export async function castDisconnect(): Promise<void> {
  if (!isCastActive()) return;
  onSessionEnded();
  try {
    await CastContext.getSessionManager().endCurrentSession(true);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "cast.disconnect" });
  }
}

/** End the session without moving playback anywhere: signing out, switching servers. */
export async function castRelease(): Promise<void> {
  if (!isCastActive()) return;
  detach();
  try {
    await CastContext.getSessionManager().endCurrentSession(true);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "cast.release" });
  }
}

registerLogoutHandler(() => {
  void castRelease();
});

// ── Loading tracks ───────────────────────────────────────────────────────────

async function loadOnReceiver(
  track: QueueTrack,
  autoplay: boolean,
  startSeconds: number,
  options: { automatic?: boolean } = {},
): Promise<boolean> {
  const receiver = client;
  if (!receiver || !isCastActive()) return false;
  const deviceName = useCastBase.getState().deviceName ?? "";
  const contentUrl = castContentUrl(track);
  if (!contentUrl || contentUrl.startsWith("file://")) {
    handleRemoteLoadFailure({
      automatic: options.automatic ?? false,
      deviceName,
      track,
    });
    return false;
  }

  const generation = ++currentGeneration;
  resetPlaybackState(startSeconds, track.duration ?? 0);
  notifyChange();
  try {
    await receiver.loadMedia({
      autoplay,
      startTime: track.isRadio || startSeconds <= 0 ? undefined : startSeconds,
      mediaInfo: {
        contentUrl,
        contentType: castMime(track),
        streamType: track.isRadio
          ? MediaStreamType.LIVE
          : MediaStreamType.BUFFERED,
        streamDuration: track.isRadio ? undefined : track.duration,
        customData: { trackId: track.id, generation },
        metadata: {
          type: "musicTrack",
          title: track.title,
          albumTitle: track.album,
          artist: track.artist,
          // Only an address the receiver can reach: a cached cover lives on
          // this phone.
          images: track.artwork?.startsWith("http")
            ? [{ url: track.artwork }]
            : undefined,
        },
      },
    });
    if (generation !== currentGeneration || !isCastActive()) return false;
    // Acknowledged, not yet playing: the receiver's own status says when it is.
    loadedTrack = track;
    wasPlaying = autoplay;
    rebase(startSeconds);
    notifyChange();
    return true;
  } catch (error) {
    if (generation !== currentGeneration || !isCastActive()) return false;
    // Nothing got loaded, so the next Play is a retry of this load.
    parkReceiver(startSeconds);
    reportError(error, { area: "player", endpoint: "cast.load" });
    handleRemoteLoadFailure({
      automatic: options.automatic ?? false,
      deviceName,
      track,
    });
    notifyChange();
    return false;
  }
}

// The receiver holds one item at a time, so every queue move is pushed to it.
function subscribeQueue() {
  queueUnsubscribe?.();
  lastPushedTrackId = useQueue.getState().getCurrent()?.id ?? null;
  queueUnsubscribe = useQueue.subscribe((state) => {
    if (!isCastActive()) return;
    const current =
      state.currentIndex != null ? state.queue[state.currentIndex] : null;
    const id = current?.id ?? null;
    if (id === lastPushedTrackId) return;
    lastPushedTrackId = id;
    const automatic = consumeAutomaticAdvance();
    // The outgoing episode's progress is recorded by the player's own queue
    // subscription, which reads this target's position before this runs.
    if (!current) {
      void client?.pause().catch(() => {});
      return;
    }
    void loadOnReceiver(current, true, 0, { automatic });
  });
}

// ── Transport ────────────────────────────────────────────────────────────────

async function withCommand(
  run: (receiver: RemoteMediaClient) => Promise<void>,
): Promise<void> {
  const receiver = client;
  if (!receiver) return;
  pendingCommands += 1;
  notifyChange();
  try {
    await run(receiver);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "cast.transport" });
  } finally {
    pendingCommands -= 1;
    notifyChange();
  }
}

function castPlay() {
  if (receiverIdle) {
    const current = useQueue.getState().getCurrent();
    if (current) void loadOnReceiver(current, true, resumeAtSec ?? 0);
    return;
  }
  wasPlaying = true;
  finishedFired = false;
  rebase(lastPositionSec);
  void withCommand(async (receiver) => {
    try {
      await receiver.play();
    } catch (error) {
      wasPlaying = false;
      throw error;
    }
  });
}

function castPause() {
  if (receiverIdle) return;
  const position = interpolatedPosition();
  wasPlaying = false;
  lastPositionSec = position;
  rebase(position);
  void withCommand(async (receiver) => {
    try {
      await receiver.pause();
    } catch (error) {
      wasPlaying = true;
      rebase(position);
      throw error;
    }
  });
}

function castSeek(seconds: number) {
  rebase(seconds);
  lastPositionSec = seconds;
  // Nothing to seek in while the receiver holds no media; it happens on Play.
  if (receiverIdle) {
    resumeAtSec = seconds;
    notifyChange();
    return;
  }
  void withCommand(async (receiver) => {
    await receiver.seek({ position: seconds });
  });
}

export function castSetVolume(volume: number) {
  useCastBase.getState().setVolume(volume);
  try {
    session?.setVolume(Math.max(0, Math.min(1, volume)));
  } catch (error) {
    reportError(error, { area: "player", endpoint: "cast.volume" });
  }
}

// ── Remote target ────────────────────────────────────────────────────────────

registerRemoteTarget({
  id: "cast",
  isActive: isCastActive,
  play: castPlay,
  pause: castPause,
  togglePlayPause: () => {
    if (wasPlaying) castPause();
    else castPlay();
  },
  seekTo: castSeek,
  skipNext: () => {
    useQueue.getState().next();
  },
  skipPrevious: () => {
    if (interpolatedPosition() > RESTART_BEFORE_SECONDS) {
      castSeek(0);
      return;
    }
    const queue = useQueue.getState();
    const atStart =
      queue.repeatMode !== "all" && (queue.currentIndex ?? 0) <= 0;
    if (atStart) {
      castSeek(0);
      return;
    }
    queue.previous();
  },
  getCurrentTime: () => interpolatedPosition(),
  isPlaying: () => wasPlaying,
  setVolume: castSetVolume,
  getVolume: () => useCastBase.getState().volume,
  release: castRelease,
  isInterpolating: () => isCastActive() && wasPlaying,
  readSnapshot: (): PlaybackSnapshot => {
    const duration =
      lastDurationSec || (useQueue.getState().getCurrent()?.duration ?? 0);
    let currentTime = interpolatedPosition();
    if (duration > 0) currentTime = Math.min(currentTime, duration);
    return { playing: wasPlaying, buffering: loading, currentTime, duration };
  },
  subscribe: (onChange) => {
    changeListeners.add(onChange);
    return () => {
      changeListeners.delete(onChange);
    };
  },
});

// ── Wiring ───────────────────────────────────────────────────────────────────

// The library's session and media modules only exist where the Cast SDK does
// (Android with Play services, iOS). Elsewhere — and in tests — the target
// simply never activates.
function castNativeAvailable(): boolean {
  return (
    NativeModules.RNGCSessionManager != null &&
    NativeModules.RNGCRemoteMediaClient != null
  );
}

export function initCast() {
  if (!castNativeAvailable()) {
    useCastBase.getState().setAvailable(false);
    return;
  }
  try {
    const manager = CastContext.getSessionManager();
    manager.onSessionStarted((started) => {
      void onSessionStarted(started);
    });
    manager.onSessionResumed(onSessionResumed);
    manager.onSessionSuspended(onSessionSuspended);
    manager.onSessionEnded(onSessionEnded);
    // A session the SDK resumed on its own before these listeners existed.
    void manager
      .getCurrentCastSession()
      .then((current) => {
        if (current) void onSessionStarted(current);
      })
      .catch(() => {});
    void CastContext.getCastState()
      .then((state) => useCastBase.getState().setAvailable(state != null))
      .catch(() => useCastBase.getState().setAvailable(false));
  } catch (error) {
    useCastBase.getState().setAvailable(false);
    reportError(error, { area: "player", endpoint: "cast.init" });
  }
}

initCast();

export { useCast };
