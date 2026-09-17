import type { PlaybackSnapshot } from "@/hooks/player/playbackSnapshot";
import Native, { type UpnpDevice, type UpnpState } from "@/modules/upnp-cast";
import { getCapabilities } from "@/services/backend/capabilities";
import { streamUrl } from "@/services/backend/streaming";
import { reportError } from "@/services/errorReporting";
import {
  getConnectionType,
  getEffectiveStreamingFormat,
  subscribeConnectionType,
} from "@/services/network";
import { registerRemoteTarget } from "@/services/playback/remoteTarget";
import {
  getCurrentTime as getLocalTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  takeOverFromRemote,
} from "@/services/player";
import { useAppBase } from "@/stores/app";
import { registerLogoutHandler, useAuthBase } from "@/stores/auth";
import useJukebox from "@/stores/jukebox";
import useQueue, { type QueueTrack } from "@/stores/queue";
import useUpnp, { type UpnpPersistedSession, useUpnpBase } from "@/stores/upnp";

const SEARCH_TIMEOUT_MS = 5000;
// Restart-vs-previous threshold, matching the local player's.
const RESTART_BEFORE_SECONDS = 3;
// How long the launch check waits for NetInfo to say which network we are on.
const NETWORK_SETTLE_TIMEOUT_MS = 10_000;

export const isUpnpConnected = (): boolean => useUpnpBase.getState().connected;

// ── What the renderer is told the track is ───────────────────────────────────

const MIME_BY_SUFFIX: Record<string, string> = {
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/mp4",
  alac: "audio/mp4",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  ape: "audio/x-monkeys-audio",
  wv: "audio/x-wavpack",
};

/**
 * The MIME type to declare for a track.
 *
 * A renderer decides whether it can play something from what it is told, and our
 * stream URLs carry no file extension to guess from. What actually arrives is the
 * transcode target when one is configured, and the source file's own format
 * otherwise — not the source format in both cases, which is the mistake that makes
 * a speaker refuse a track the server was about to send it as MP3. The target has
 * to be resolved for the current network, like the stream URL itself is, or a
 * cellular-only format is streamed while the renderer is told the Wi-Fi one.
 *
 * Anything unrecognised is still audio, and saying so beats letting it be guessed.
 */
export function castMime(track: QueueTrack): string {
  const { streamingFormat, cellularStreamingFormat } = useAppBase.getState();
  const effective = getEffectiveStreamingFormat(
    streamingFormat,
    cellularStreamingFormat,
  );
  const format =
    effective && effective !== "raw"
      ? effective
      : (track.suffix as string | undefined);
  return MIME_BY_SUFFIX[(format ?? "").toLowerCase()] ?? "audio/mpeg";
}

// ── The end-of-track state machine ───────────────────────────────────────────

// UPnP reports STOPPED for a track that finished and for one the user stopped,
// with nothing to tell them apart. Advancing the queue on the wrong one either
// skips a track the listener paused, or leaves playback dead at the end of every
// song, so the difference is inferred from what we asked for and what we saw.
let lastPositionSec = 0;
let lastDurationSec = 0;
// Set while a track is being handed over: a renderer reports STOPPED in the gap
// between accepting a URI and starting it, which is not an ending.
let loading = false;
// PLAYING has been seen since the last load. Without this, a renderer that never
// started would look like a track that finished instantly.
let wasPlaying = false;
// We asked for the pause, so the STOPPED that some renderers send instead of
// PAUSED is ours and not an ending.
let pausedByUs = false;
let finishedFired = false;

// Interpolation base for the 1 Hz poll, so the seek bar and synced lyrics move at
// screen rate instead of stepping once a second.
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

function resetPlaybackState(positionSec: number, duration: number) {
  lastPositionSec = positionSec;
  lastDurationSec = duration;
  loading = true;
  wasPlaying = false;
  pausedByUs = false;
  finishedFired = false;
  rebase(positionSec);
}

let stateSubscription: { remove: () => void } | undefined;

function onNativeState(state: UpnpState) {
  if (!isUpnpConnected()) return;
  const position = (state.positionMs ?? 0) / 1000;
  const duration = (state.durationMs ?? 0) / 1000;
  if (position > 0) lastPositionSec = position;
  if (duration > 0) lastDurationSec = duration;

  switch (state.playbackState) {
    case "PLAYING":
      loading = false;
      wasPlaying = true;
      pausedByUs = false;
      finishedFired = false;
      rebase(position);
      break;
    case "TRANSITIONING":
      break;
    case "PAUSED_PLAYBACK":
    case "PAUSED_RECORDING":
      wasPlaying = false;
      rebase(position);
      break;
    case "STOPPED":
    case "NO_MEDIA_PRESENT":
      if (
        !finishedFired &&
        !loading &&
        wasPlaying &&
        !pausedByUs &&
        nearEnd()
      ) {
        finishedFired = true;
        wasPlaying = false;
        advanceAfterTrackEnd();
      }
      break;
    default:
      break;
  }
  notifyChange();
}

/**
 * Whether the last position we saw is close enough to the end to call it one.
 *
 * The window is generous — a tenth of the track, at least five seconds — because
 * the poll only lands once a second and some renderers stop reporting a position
 * for the last few seconds of a track. A tight threshold leaves the queue stuck at
 * the end of a song, which is far more noticeable than advancing a moment early.
 *
 * With no known duration there is nothing to compare against, so trust that we
 * were playing: advancing beats stalling.
 */
function nearEnd(): boolean {
  if (lastDurationSec <= 0) return true;
  const window = Math.max(5, lastDurationSec * 0.1);
  return lastPositionSec >= lastDurationSec - window;
}

/**
 * Move to whatever should play next.
 *
 * Repeat-one needs handling here rather than through the queue: `next()`
 * deliberately keeps the same index, so the track-change subscription never fires
 * and the renderer would simply sit silent at the end of the song.
 */
function advanceAfterTrackEnd() {
  const state = useQueue.getState();
  if (state.repeatMode === "one") {
    const current = state.getCurrent();
    if (current) void loadOnRenderer(current, true, 0);
    return;
  }
  const atTail =
    state.currentIndex == null ||
    (state.repeatMode === "off" &&
      !state.removePlayed &&
      state.currentIndex >= state.queue.length - 1);
  if (atTail) {
    // End of the queue with nothing to repeat: stop the renderer but leave the
    // track loaded, so the player keeps its title, artist and cover the way it
    // does when local playback runs out.
    void Native?.pause();
    return;
  }
  state.next();
}

// ── Loading tracks ───────────────────────────────────────────────────────────

/**
 * Hand a track to the renderer.
 *
 * Returns false for anything the renderer cannot fetch — a local-library file or a
 * download resolves to a `file://` URI that exists only on this phone. The
 * capability flag keeps UPnP off the output list for a local server entirely; this
 * is the backstop for a single unreachable track on a server that is otherwise fine.
 */
async function loadOnRenderer(
  track: QueueTrack,
  autoplay: boolean,
  startSeconds: number,
): Promise<boolean> {
  if (!Native || !isUpnpConnected()) return false;
  // Radio and podcasts carry their own absolute URL; everything else is built
  // from the server, deliberately ignoring any downloaded copy.
  const url = (track.streamUrl as string | undefined) ?? streamUrl(track.id);
  if (!url || url.startsWith("file://")) return false;

  resetPlaybackState(startSeconds, track.duration ?? 0);
  try {
    const ok = await Native.load(
      url,
      {
        mime: castMime(track),
        title: track.title ?? "",
        artist: track.artist,
        album: track.album,
        // Only an address the renderer can reach: a cached cover lives on this
        // phone and would render as a broken image on the device.
        artworkUrl: track.artwork?.startsWith("http")
          ? track.artwork
          : undefined,
        durationSec: track.duration,
      },
      autoplay,
    );
    if (!ok) {
      loading = false;
      return false;
    }
    rememberTrack(track.id, url);
    if (startSeconds > 0) await Native.seek(startSeconds * 1000);
    return true;
  } catch (error) {
    loading = false;
    reportError(error, { area: "player", endpoint: "upnp.load" });
    return false;
  }
}

// The renderer holds one URI at a time, so every queue move has to be pushed to
// it. Mirrors the local player's own queue subscription, which stands down while
// a remote target owns playback.
let queueUnsubscribe: (() => void) | null = null;
let lastPushedTrackId: string | null = null;

function subscribeQueue() {
  queueUnsubscribe?.();
  lastPushedTrackId = useQueue.getState().getCurrent()?.id ?? null;
  queueUnsubscribe = useQueue.subscribe((state) => {
    if (!isUpnpConnected()) return;
    const current =
      state.currentIndex != null ? state.queue[state.currentIndex] : null;
    const id = current?.id ?? null;
    if (id === lastPushedTrackId) return;
    lastPushedTrackId = id;
    if (!current) {
      void Native?.pause();
      return;
    }
    void loadOnRenderer(current, true, 0);
  });
}

// ── Session ──────────────────────────────────────────────────────────────────

export async function upnpSearch(): Promise<void> {
  if (!Native || useUpnpBase.getState().scanning) return;
  const store = useUpnpBase.getState();
  store.setScanning(true);
  try {
    const found = await Native.search(SEARCH_TIMEOUT_MS);
    useUpnpBase.getState().mergeDevices(found);
  } catch (error) {
    // Keep whatever the previous scan found rather than emptying the list on a
    // failure the user can do nothing about.
    reportError(error, { area: "player", endpoint: "upnp.search" });
  } finally {
    useUpnpBase.getState().setScanning(false);
  }
}

/**
 * Move playback to a renderer, picking up where this device left off.
 */
export async function upnpConnect(device: UpnpDevice): Promise<boolean> {
  if (!Native) return false;
  const position = getLocalTime();
  const wasLocallyPlaying = isLocalPlaying();
  pauseLocal();

  let connected = false;
  try {
    connected = await Native.connect(device.id);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.connect" });
  }
  if (!connected) {
    if (wasLocallyPlaying) {
      const current = useQueue.getState().getCurrent();
      if (current) takeOverFromRemote(position, true);
    }
    return false;
  }

  attach(device, { trackId: "", trackUrl: "" });
  const current = useQueue.getState().getCurrent();
  if (current) {
    const loaded = await loadOnRenderer(current, wasLocallyPlaying, position);
    if (!loaded) {
      await upnpDisconnect();
      return false;
    }
  }
  await adoptRendererVolume();
  return true;
}

// Everything that makes a connected renderer this app's output, shared by a
// fresh connection and a session picked back up after a restart.
function attach(
  device: UpnpDevice,
  track: Pick<UpnpPersistedSession, "trackId" | "trackUrl">,
) {
  if (!Native) return;
  stateSubscription?.remove();
  stateSubscription = Native.addListener("state", onNativeState);
  const store = useUpnpBase.getState();
  store.setConnected(device.id, device.name);
  store.setSession({
    deviceId: device.id,
    deviceName: device.name,
    address: device.address,
    location: device.location,
    ...track,
  });
  subscribeQueue();
  notifyChange();
}

function rememberTrack(trackId: string, trackUrl: string) {
  const { session, setSession } = useUpnpBase.getState();
  if (!session) return;
  setSession({ ...session, trackId, trackUrl });
}

// Adopt the renderer's own volume so the slider starts where the device is,
// rather than snapping it to a value the listener never chose.
async function adoptRendererVolume() {
  try {
    const volume = await Native?.getVolume();
    if (volume != null) useUpnpBase.getState().setVolume(volume / 100);
  } catch {
    // A renderer without RenderingControl just keeps the stored value.
  }
}

function detach() {
  stateSubscription?.remove();
  stateSubscription = undefined;
  queueUnsubscribe?.();
  queueUnsubscribe = null;
  useUpnpBase.getState().setConnected(null, null);
  useUpnpBase.getState().setSession(null);
  notifyChange();
}

/**
 * Stop the renderer and bring playback back to this device, at the position and
 * play state the renderer had reached.
 */
export async function upnpDisconnect(): Promise<void> {
  if (!isUpnpConnected()) return;
  const position = lastPositionSec;
  const shouldPlay = wasPlaying;

  detach();
  try {
    await Native?.disconnect();
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.disconnect" });
  }
  takeOverFromRemote(position, shouldPlay);
}

/**
 * Stop the renderer and forget the session without moving playback anywhere.
 *
 * For signing out and switching servers: the local engine is being silenced too,
 * and a renderer left connected would keep receiving the next session's queue.
 */
export async function upnpRelease(): Promise<void> {
  const { connected, session, pendingResume, setSession, setPendingResume } =
    useUpnpBase.getState();
  pendingProbe = null;
  if (pendingResume) setPendingResume(false);
  if (!connected) {
    if (session) setSession(null);
    return;
  }
  detach();
  try {
    await Native?.disconnect();
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.release" });
  }
}

registerLogoutHandler(() => {
  void upnpRelease();
});

// ── Picking a session back up after a restart ────────────────────────────────

// What the launch check found, kept for whichever answer the user gives to the
// resume prompt. Lives outside the store because it is only meaningful between
// the prompt being raised and answered.
let pendingProbe: {
  device: UpnpDevice;
  state: UpnpState;
  session: UpnpPersistedSession;
} | null = null;

// Only ever forgets the session the check started with: after a sign-out or
// server switch the store holds another scope's session, which is not ours to
// drop.
function forgetSession(session: UpnpPersistedSession) {
  const store = useUpnpBase.getState();
  if (store.session === session) store.setSession(null);
}

// A renderer's TrackURI is the URI we gave it, but some hand it back with the
// entities still escaped or with padding around it.
function sameUri(a: string, b: string): boolean {
  const norm = (u: string) => u.trim().replace(/&amp;/g, "&");
  return norm(a) === norm(b);
}

// Renderers that never report TrackURI can still be told apart from someone
// else's music by the length of what they hold. No duration on either side is
// no evidence, and "Play here" would stop whatever is playing, so it counts as
// not ours.
const DURATION_TOLERANCE_SEC = 2;
function sameDuration(rendererMs: number, trackSec?: number): boolean {
  if (!rendererMs || !trackSec) return false;
  return Math.abs(rendererMs / 1000 - trackSec) <= DURATION_TOLERANCE_SEC;
}

const onLocalNetwork = (type: string) => type === "wifi" || type === "ethernet";

// NetInfo reports "unknown" until its first fetch lands, which is usually after
// this check starts on a cold launch. Resolves with whether we are on a network
// that can reach a renderer, waiting a bounded time for the answer to settle.
function waitForLocalNetwork(): Promise<boolean> {
  const type = getConnectionType();
  if (type !== "unknown") return Promise.resolve(onLocalNetwork(type));
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | null = null;
    const finish = (result: boolean) => {
      clearTimeout(timer);
      unsubscribe?.();
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), NETWORK_SETTLE_TIMEOUT_MS);
    unsubscribe = subscribeConnectionType((next) => {
      if (next !== "unknown") finish(onLocalNetwork(next));
    });
  });
}

// The renderer by its saved description URL first, which is a single request to
// the device; a search only when that fails, since DHCP may have moved it and
// its UDN is the one thing that survives a new address. A device that never
// gave a UDN is keyed by its address, so a new one cannot be matched.
async function findRenderer(
  session: UpnpPersistedSession,
): Promise<UpnpDevice | null> {
  if (!Native) return null;
  try {
    const described = await Native.describe(session.deviceId, session.location);
    if (described) return described;
    if (session.deviceId === session.address) return null;
    const found = await Native.search(SEARCH_TIMEOUT_MS);
    return found.find((device) => device.id === session.deviceId) ?? null;
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.describe" });
    return null;
  }
}

/**
 * On app launch, if a session was saved, check whether the renderer is still
 * holding the track we gave it. If it is, raise the resume prompt; in every
 * other case forget the session quietly. A renderer holds one URI and no queue,
 * so once it has moved on there is nothing left to resume — and it must never
 * start playing because the app came back.
 */
export async function initUpnpOnLaunch(): Promise<void> {
  const store = useUpnpBase.getState();
  const session = store.session;
  if (!session) return;
  if (
    !Native ||
    store.connected ||
    useJukebox.getState().active ||
    !getCapabilities(useAuthBase.getState().serverType).remoteStreamableUrl
  ) {
    forgetSession(session);
    return;
  }
  const current = useQueue.getState().getCurrent();
  if (!current || current.id !== session.trackId) {
    forgetSession(session);
    return;
  }
  if (!(await waitForLocalNetwork())) {
    forgetSession(session);
    return;
  }
  const device = await findRenderer(session);
  if (!device) {
    forgetSession(session);
    return;
  }
  let state: UpnpState | null = null;
  try {
    state = await Native.probe(device.id);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.probe" });
  }
  if (!state) {
    forgetSession(session);
    return;
  }
  const holdsOurTrack = state.trackUri
    ? sameUri(state.trackUri, session.trackUrl)
    : sameDuration(state.durationMs, current.duration);
  const stillOnIt =
    state.playbackState === "PLAYING" ||
    state.playbackState === "PAUSED_PLAYBACK";
  // The saved session belongs to the account it was written under: a sign-out
  // or server switch while we were asking the network has already replaced it,
  // and the prompt must not land in the new scope.
  if (useUpnpBase.getState().session !== session) return;
  // The user may have pressed play on this device, or picked an output, while
  // we were asking the network; either is an answer already.
  if (
    !holdsOurTrack ||
    !stillOnIt ||
    isLocalPlaying() ||
    useUpnpBase.getState().connected
  ) {
    if (!useUpnpBase.getState().connected) forgetSession(session);
    return;
  }
  pendingProbe = { device, state, session };
  useUpnpBase.getState().setPendingResume(true);
}

/**
 * Take the renderer back as this app's output, from where it is now.
 *
 * The renderer already has the track, so nothing is loaded — the end-of-track
 * state machine is seeded from what the probe saw instead, or the first STOPPED
 * near the end would not count as an ending and the seek bar would start at 0.
 */
export async function reattach(): Promise<void> {
  const probe = pendingProbe;
  pendingProbe = null;
  if (!probe || !Native) return;
  pauseLocal();
  let connected = false;
  try {
    connected = await Native.connect(probe.device.id);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.connect" });
  }
  if (!connected) {
    forgetSession(probe.session);
    takeOverFromRemote(
      probe.state.positionMs / 1000,
      probe.state.playbackState === "PLAYING",
    );
    return;
  }
  seedFromProbe(probe.state);
  attach(probe.device, probe.session);
  await adoptRendererVolume();
}

function seedFromProbe(state: UpnpState) {
  lastPositionSec = state.positionMs / 1000;
  lastDurationSec = state.durationMs / 1000;
  loading = false;
  wasPlaying = state.playbackState === "PLAYING";
  pausedByUs = state.playbackState === "PAUSED_PLAYBACK";
  finishedFired = false;
  rebase(lastPositionSec);
}

/**
 * Leave the renderer and continue on this device from where it got to. The
 * renderer is stopped first: it was never connected in this run, but it is
 * still holding our track and may be playing it.
 */
export async function takeOverLocally(): Promise<void> {
  const probe = pendingProbe;
  pendingProbe = null;
  if (!probe) return;
  forgetSession(probe.session);
  try {
    if (await Native?.connect(probe.device.id)) await Native?.disconnect();
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.disconnect" });
  }
  takeOverFromRemote(
    probe.state.positionMs / 1000,
    probe.state.playbackState === "PLAYING",
  );
}

// ── Transport ────────────────────────────────────────────────────────────────

function upnpPlay() {
  pausedByUs = false;
  void Native?.play();
}

function upnpPause() {
  pausedByUs = true;
  void Native?.pause();
}

function upnpSeek(seconds: number) {
  rebase(seconds);
  lastPositionSec = seconds;
  void Native?.seek(seconds * 1000);
}

export function upnpSetVolume(volume: number) {
  useUpnpBase.getState().setVolume(volume);
  void Native?.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
}

// ── Remote target ────────────────────────────────────────────────────────────

registerRemoteTarget({
  id: "upnp",
  isActive: isUpnpConnected,
  play: upnpPlay,
  pause: upnpPause,
  togglePlayPause: () => {
    if (wasPlaying) upnpPause();
    else upnpPlay();
  },
  seekTo: upnpSeek,
  // The renderer knows nothing of a queue, so skipping is a queue move here and
  // the track-change subscription pushes the new URI to the device.
  skipNext: () => {
    useQueue.getState().next();
  },
  skipPrevious: () => {
    if (lastPositionSec > RESTART_BEFORE_SECONDS) {
      upnpSeek(0);
      return;
    }
    const queue = useQueue.getState();
    const atStart =
      queue.repeatMode !== "all" && (queue.currentIndex ?? 0) <= 0;
    if (atStart) {
      upnpSeek(0);
      return;
    }
    queue.previous();
  },
  getCurrentTime: () => lastPositionSec,
  isPlaying: () => wasPlaying,
  setVolume: upnpSetVolume,
  isInterpolating: () => isUpnpConnected() && wasPlaying,
  readSnapshot: (): PlaybackSnapshot => {
    const duration =
      lastDurationSec || (useQueue.getState().getCurrent()?.duration ?? 0);
    const elapsed = wasPlaying ? (Date.now() - baseAt) / 1000 : 0;
    let currentTime = basePosition + elapsed;
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

export { useUpnp };
