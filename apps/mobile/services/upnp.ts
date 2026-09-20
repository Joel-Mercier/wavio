import { AppState } from "react-native";
import type { PlaybackSnapshot } from "@/hooks/player/playbackSnapshot";
import Native, { type UpnpDevice, type UpnpState } from "@/modules/upnp-cast";
import { getCapabilities } from "@/services/backend/capabilities";
import { streamUrl } from "@/services/backend/streaming";
import { reportError } from "@/services/errorReporting";
import { getConnectionType, subscribeConnectionType } from "@/services/network";
import { castMime } from "@/services/playback/castMime";
import {
  advanceAfterTrackEnd as advanceQueueAfterTrackEnd,
  consumeAutomaticAdvance,
  handleRemoteLoadFailure,
  noteRemoteLoadSucceeded,
  noticeRemoteLost,
  resetRemoteAdvance,
} from "@/services/playback/remoteAdvance";
import { registerRemoteTarget } from "@/services/playback/remoteTarget";
import { sameStreamUri } from "@/services/playback/streamUri";
import {
  getCurrentTime as getLocalTime,
  isPlaying as isLocalPlaying,
  pause as pauseLocal,
  takeOverFromRemote,
} from "@/services/player";
import { registerLogoutHandler, useAuthBase } from "@/stores/auth";
import useJukebox from "@/stores/jukebox";
import useQueue, { type QueueTrack } from "@/stores/queue";
import useUpnp, { type UpnpPersistedSession, useUpnpBase } from "@/stores/upnp";

// Long enough for the slow ones — a TV waking up takes several seconds to
// answer — without costing anything visible: devices are listed as they
// answer, not when the search ends.
const SEARCH_TIMEOUT_MS = 8000;
// Restart-vs-previous threshold, matching the local player's.
const RESTART_BEFORE_SECONDS = 3;
// How long the launch check waits for NetInfo to say which network we are on.
const NETWORK_SETTLE_TIMEOUT_MS = 10_000;

export const isUpnpConnected = (): boolean => useUpnpBase.getState().connected;

// The MIME resolution lives with the other remote targets now; kept exported
// from here for the callers that learned it under this name.
export { castMime };

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
let errorFired = false;

// Numbers every load, and is what a poll's report is checked against: the native
// side stamps each report with the load whose track the renderer held when it was
// taken, and a report about a track we have since replaced is dropped here rather
// than mistaken for the new one ending. Bumped before the load is even sent, so
// the check holds while the handover is still in flight.
let currentGeneration = 0;
// The URI the renderer was last handed. A renderer that reports what it holds
// is only believed about *our* track when the two agree.
let loadedTrackUri = "";
// Transport commands in flight. Their outcome is applied optimistically, and a
// poll that could contradict them can only have been taken before they landed,
// so reports are ignored until they resolve.
let pendingCommands = 0;
// Where to seek once the renderer plays again, for the ones that have no Pause
// and were stopped instead (losing their position), and for a track parked
// paused at an offset.
let resumeAtSec: number | null = null;

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
  pausedByUs = false;
  finishedFired = false;
  errorFired = false;
  resumeAtSec = null;
  rebase(positionSec);
}

let stateSubscription: { remove: () => void } | undefined;
let lostSubscription: { remove: () => void } | undefined;

function onNativeState(state: UpnpState) {
  if (!isUpnpConnected()) return;
  if ((state.generation ?? 0) !== currentGeneration) return;
  if (pendingCommands > 0) return;
  const position = (state.positionMs ?? 0) / 1000;
  const duration = (state.durationMs ?? 0) / 1000;
  if (position > 0) lastPositionSec = position;
  if (duration > 0) lastDurationSec = duration;

  // A renderer that says what it holds is only believed about our track when it
  // names it. Between tracks some go on reporting the previous one for a poll
  // or two, and that one ending is old news.
  const aboutOurTrack =
    !state.trackUri ||
    !loadedTrackUri ||
    sameStreamUri(state.trackUri, loadedTrackUri);

  if (
    state.transportStatus?.toUpperCase() === "ERROR_OCCURRED" &&
    !errorFired &&
    !loading
  ) {
    errorFired = true;
    wasPlaying = false;
    onRendererError();
    notifyChange();
    return;
  }

  switch (state.playbackState) {
    case "PLAYING":
      if (!aboutOurTrack) break;
      loading = false;
      wasPlaying = true;
      pausedByUs = false;
      finishedFired = false;
      // Whatever we meant to seek back to, the renderer is playing from where it
      // is now; a resume left pending here would make every later seek wait for
      // a Play that is not coming.
      resumeAtSec = null;
      rebase(position);
      break;
    case "TRANSITIONING":
      break;
    case "PAUSED_PLAYBACK":
    case "PAUSED_RECORDING":
      if (!aboutOurTrack) break;
      loading = false;
      wasPlaying = false;
      // Parked at the top with a resume pending (a handover made while paused):
      // the seek bar shows where playback will pick up, not the renderer's zero.
      rebase(resumeAtSec ?? position);
      break;
    case "STOPPED":
    case "NO_MEDIA_PRESENT":
      if (!aboutOurTrack || loading || !wasPlaying || pausedByUs) break;
      if (!finishedFired && nearEnd()) {
        finishedFired = true;
        wasPlaying = false;
        advanceAfterTrackEnd();
        break;
      }
      // Stopped from the renderer's own remote, mid-track. Not an ending, and
      // not playing either: hold where it was, and since a stopped renderer
      // starts over from the top, put it back there on the next Play.
      wasPlaying = false;
      resumeAtSec = lastPositionSec;
      rebase(lastPositionSec);
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

function advanceAfterTrackEnd() {
  advanceQueueAfterTrackEnd({
    reload: (track) => {
      void loadOnRenderer(track, true, 0, { automatic: true });
    },
    stop: () => {
      pausedByUs = true;
      void Native?.pause();
    },
  });
}

// The renderer choked on the stream mid-track (or reported the failure only
// after the handover looked fine). Nobody pressed anything, so it is treated as
// an automatic advance that failed: the next track gets one try.
function onRendererError() {
  const current = useQueue.getState().getCurrent();
  if (!current) return;
  handleRemoteLoadFailure({
    automatic: true,
    deviceName: useUpnpBase.getState().deviceName ?? "",
    track: current,
  });
}

// ── Loading tracks ───────────────────────────────────────────────────────────

/**
 * Hand a track to the renderer.
 *
 * Returns false for anything the renderer cannot fetch — a local-library file or a
 * download resolves to a `file://` URI that exists only on this phone. The
 * capability flag keeps UPnP off the output list for a local server entirely; this
 * is the backstop for a single unreachable track on a server that is otherwise fine.
 *
 * A refusal is reported to the listener and the queue stays where it is (see
 * `handleRemoteLoadFailure`); a load overtaken by a newer one before it reached the
 * renderer is neither a success nor a failure, and says nothing.
 */
async function loadOnRenderer(
  track: QueueTrack,
  autoplay: boolean,
  startSeconds: number,
  options: { automatic?: boolean } = {},
): Promise<boolean> {
  if (!Native || !isUpnpConnected()) return false;
  const deviceName = useUpnpBase.getState().deviceName ?? "";
  // Radio and podcasts carry their own absolute URL; everything else is built
  // from the server, deliberately ignoring any downloaded copy.
  const url = (track.streamUrl as string | undefined) ?? streamUrl(track.id);
  if (!url || url.startsWith("file://")) {
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
    const result = await Native.load(
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
      autoplay ? Math.round(startSeconds * 1000) : 0,
      generation,
    );
    // A newer load has been asked for meanwhile; whatever this one did on the
    // renderer, the other is in charge of the story from here.
    if (generation !== currentGeneration || !isUpnpConnected()) return false;
    if (!result.ok) {
      if (result.reason === "superseded") return false;
      loading = false;
      wasPlaying = false;
      // A renderer that did not answer at all has refused nothing. The poll
      // loop reports it lost if it stays silent; blaming the track meanwhile
      // sends the listener looking for a problem that is not there.
      if (result.reason !== "unreachable") {
        handleRemoteLoadFailure({
          automatic: options.automatic ?? false,
          deviceName,
          track,
        });
      }
      notifyChange();
      return false;
    }
    loading = false;
    loadedTrackUri = url;
    if (autoplay) {
      wasPlaying = true;
      rebase(startSeconds);
    } else {
      pausedByUs = true;
      if (startSeconds > 0) resumeAtSec = startSeconds;
    }
    noteRemoteLoadSucceeded();
    rememberTrack(track.id, url);
    notifyChange();
    return true;
  } catch (error) {
    if (generation !== currentGeneration) return false;
    loading = false;
    wasPlaying = false;
    reportError(error, { area: "player", endpoint: "upnp.load" });
    handleRemoteLoadFailure({
      automatic: options.automatic ?? false,
      deviceName,
      track,
    });
    notifyChange();
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
    const automatic = consumeAutomaticAdvance();
    if (!current) {
      pausedByUs = true;
      void Native?.pause();
      return;
    }
    void loadOnRenderer(current, true, 0, { automatic });
  });
}

// ── Session ──────────────────────────────────────────────────────────────────

// Every renderer the native side finds — mid-search, or announcing itself while
// the picker is open — lands in the list the moment its description is in.
let deviceSubscription: { remove: () => void } | undefined;
function listenForDevices() {
  if (deviceSubscription || !Native) return;
  deviceSubscription = Native.addListener("device", (device) => {
    useUpnpBase.getState().mergeDevices([device]);
  });
}

export async function upnpSearch(): Promise<void> {
  if (!Native || useUpnpBase.getState().scanning) return;
  listenForDevices();
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
 * Everything the output picker needs while it is open: every renderer already
 * known — listed from an earlier scan, or played to before — is asked for its
 * description directly (one request each, no multicast to lose), then the
 * network is searched, and announcements are listened for until
 * `upnpStopDiscovery`. Meant to run the moment the picker is asked to open, so
 * it never shows a finished, empty search it has not run yet.
 */
export function upnpStartDiscovery(): void {
  if (!Native) return;
  listenForDevices();
  seedActiveRenderer();
  void Native.startListening().catch((error) => {
    reportError(error, { area: "player", endpoint: "upnp.listen" });
  });
  void probeKnownRenderers();
  void upnpSearch();
}

export function upnpStopDiscovery(): void {
  void Native?.stopListening().catch(() => {});
}

// The renderer playback is on belongs in the list before any probe answers: a
// fresh process has no list yet, and a picker that shows nothing while a speaker
// is audibly playing what we sent it is not to be trusted.
function seedActiveRenderer() {
  const store = useUpnpBase.getState();
  if (!store.connected || !store.deviceId) return;
  if (store.devices.some((device) => device.id === store.deviceId)) return;
  const active = store.seen.find((entry) => entry.id === store.deviceId);
  if (active) store.mergeDevices([active]);
}

/**
 * Asks each known renderer, at its own address, whether it is still there.
 *
 * A search can miss a device that is on — UDP — which is why the list is merged
 * across scans rather than replaced. A direct request to a known address has no
 * such excuse: one that does not answer it is off or gone, and a row for it
 * would only ever produce a failed connection. The one currently in use is the
 * poll loop's to declare lost, not this probe's.
 */
async function probeKnownRenderers(): Promise<void> {
  if (!Native) return;
  const native = Native;
  const store = useUpnpBase.getState();
  const known = new Map<string, { id: string; location: string }>();
  for (const device of store.devices) known.set(device.id, device);
  for (const entry of store.seen) {
    if (!known.has(entry.id)) known.set(entry.id, entry);
  }
  await Promise.all(
    [...known.values()].map(async (entry) => {
      let device: UpnpDevice | null = null;
      try {
        device = await native.describe(entry.id, entry.location);
      } catch {
        device = null;
      }
      if (device) useUpnpBase.getState().mergeDevices([device]);
      else if (entry.id !== useUpnpBase.getState().deviceId) {
        useUpnpBase.getState().forgetDevice(entry.id);
      }
    }),
  );
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
    // It answered a search or a probe and then nothing since: off, most likely,
    // and a row that fails on every tap is worse than none until it shows again.
    useUpnpBase.getState().forgetDevice(device.id);
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
      // Back to where the phone was, not to what the failed handover left
      // behind: the state machine was reset for a track that never played.
      detach();
      try {
        await Native.disconnect();
      } catch (error) {
        reportError(error, { area: "player", endpoint: "upnp.disconnect" });
      }
      takeOverFromRemote(position, wasLocallyPlaying);
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
  lostSubscription?.remove();
  lostSubscription = Native.addListener("lost", onRendererLost);
  currentGeneration = 0;
  loadedTrackUri = track.trackUrl;
  pendingCommands = 0;
  resumeAtSec = null;
  resetRemoteAdvance();
  const store = useUpnpBase.getState();
  store.setConnected(device.id, device.name);
  if (device.id !== device.address) store.rememberSeen(device);
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
  lostSubscription?.remove();
  lostSubscription = undefined;
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
  const position = interpolatedPosition();
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

// The renderer has not answered for a while and the native side has given up
// on it. Playback comes back here, paused: it may well still be playing over
// there, and two outputs at once is the one thing worse than silence.
function onRendererLost() {
  if (!isUpnpConnected()) return;
  const name = useUpnpBase.getState().deviceName ?? "";
  // The last position the renderer confirmed, not the clock that kept running
  // through the seconds it stayed silent: a renderer that went away most likely
  // never played those, and picking up a little early beats skipping them.
  const position = lastPositionSec;
  detach();
  void Native?.disconnect().catch((error) => {
    reportError(error, { area: "player", endpoint: "upnp.disconnect" });
  });
  takeOverFromRemote(position, false);
  noticeRemoteLost(name);
}

// A poll straight away on coming back to the foreground: the schedule kept
// running while the app was away, but the seek bar was interpolating blind.
AppState.addEventListener("change", (state) => {
  if (state === "active" && isUpnpConnected()) void Native?.pollNow();
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
    ? sameStreamUri(state.trackUri, session.trackUrl)
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
  errorFired = false;
  resumeAtSec = null;
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

// Commands take effect on the phone's side of the story at once, and the
// renderer is expected to agree by the next poll. Polls are ignored while a
// command is in flight (see `pendingCommands`), and a refusal undoes the guess.

async function withCommand(
  run: (native: NonNullable<typeof Native>) => Promise<void>,
): Promise<void> {
  if (!Native) return;
  const native = Native;
  pendingCommands += 1;
  notifyChange();
  try {
    await run(native);
  } catch (error) {
    reportError(error, { area: "player", endpoint: "upnp.transport" });
  } finally {
    pendingCommands -= 1;
    notifyChange();
  }
}

function upnpPlay() {
  pausedByUs = false;
  wasPlaying = true;
  finishedFired = false;
  rebase(resumeAtSec ?? lastPositionSec);
  // A renderer stopped in lieu of pausing starts over from the top; the native
  // side puts it back where the listener left it once it is actually playing.
  const resumeAt = resumeAtSec;
  resumeAtSec = null;
  void withCommand(async (native) => {
    const ok = await native.play(resumeAt != null ? resumeAt * 1000 : 0);
    if (!ok) {
      wasPlaying = false;
      return;
    }
    if (resumeAt != null) {
      lastPositionSec = resumeAt;
      rebase(resumeAt);
    }
  });
}

function upnpPause() {
  const position = interpolatedPosition();
  pausedByUs = true;
  wasPlaying = false;
  lastPositionSec = position;
  rebase(position);
  void withCommand(async (native) => {
    const result = await native.pause();
    if (!result.ok) {
      pausedByUs = false;
      wasPlaying = true;
      rebase(position);
      return;
    }
    if (result.stoppedInstead) resumeAtSec = position;
  });
}

function upnpSeek(seconds: number) {
  rebase(seconds);
  lastPositionSec = seconds;
  // Nothing to seek in while the renderer is stopped; it happens on resume.
  if (resumeAtSec != null) {
    resumeAtSec = seconds;
    notifyChange();
    return;
  }
  void withCommand(async (native) => {
    await native.seek(seconds * 1000);
  });
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
    if (interpolatedPosition() > RESTART_BEFORE_SECONDS) {
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
  getCurrentTime: () => interpolatedPosition(),
  isPlaying: () => wasPlaying,
  setVolume: upnpSetVolume,
  getVolume: () => useUpnpBase.getState().volume,
  release: upnpRelease,
  isInterpolating: () => isUpnpConnected() && wasPlaying,
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

export { useUpnp };
