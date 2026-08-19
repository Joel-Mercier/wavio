import { Platform } from "react-native";
import i18n from "@/config/i18n";
import {
  getPlaybackSnapshot,
  subscribePlaybackState,
} from "@/hooks/player/playbackSnapshot";
import {
  cachedCarArtwork,
  clearCarArtworkCache,
  ensureCarArtwork,
} from "@/services/carAuto/artworkMirror";
import {
  CarAutoBridge,
  type NowPlayingPayload,
} from "@/services/carAuto/bridge";
import { setupCarPlay, updateCarPlayTree } from "@/services/carAuto/carplay";
import { handleBrowsePlay } from "@/services/carAuto/play";
import {
  buildBrowseTree,
  getSnapshot,
  localizeTreeArtwork,
} from "@/services/carAuto/tree";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  configurePlayback,
  pause,
  play,
  seekTo,
  skipNext,
  skipPrevious,
  togglePlayPause,
} from "@/services/player";
import {
  applyStartupLocale,
  hydratePlaybackStores,
} from "@/services/startupHydration";
import {
  currentAuthScope,
  registerLogoutHandler,
  useAuthBase,
} from "@/stores/auth";
import usePodcasts, { podcastFavoritesForScope } from "@/stores/podcasts";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";

// Bridges the app to Android Auto / CarPlay: pushes the browse tree, mirrors
// now-playing + queue + playback state, and routes car intents back into the
// player.
//
// This deliberately lives outside React. Android Auto binds the media service
// without ever starting an Activity, so the JS runtime can boot with no UI at
// all (see ReactHostBoot on the native side) — anything wired from a component
// would never run in that case, and taps in the car would go nowhere. Started
// from index.js so it covers every JS boot, headless or not.

const REBUILD_DEBOUNCE_MS = 500;
// How long a pushed tree is trusted before the next trigger is allowed to
// rebuild it. The fingerprint below can only cover local state, but most of
// what the tree shows comes from the server (home sections, playlists, starred)
// and nothing notifies this process when the phone UI — or another client —
// changes any of it. The TTL bounds how stale the car's view can get while
// still collapsing the burst of triggers a single play produces.
const REBUILD_TTL_MS = 5 * 60 * 1000;
const PLAYBACK_PUSH_INTERVAL_MS = 1000;

// Pairs with CarAutoLog on the native side: a headless session has no UI to
// report from, so logcat is the only way to tell "did nothing" apart from
// "chose to do nothing".
const log = (message: string, error?: unknown) => {
  if (!__DEV__) return;
  if (error !== undefined) console.log(`[carauto] ${message}`, error);
  else console.log(`[carauto] ${message}`);
};

type QueueEntry = ReturnType<typeof useQueue.getState>["queue"][number];

// Prefer an already-mirrored copy of the cover. Unlike the browse tree, the
// now-playing cover is loaded by media3's BitmapLoader *in this process*, so a
// remote URL does work — until the server needs custom headers or a self-signed
// certificate, neither of which that loader carries. A local file covers those
// too, and is what the native side turns into a content:// URI for the host.
// `cachedCarArtwork` checks the file still exists, so an entry the OS reclaimed
// from the cache dir falls back to the remote URL rather than to nothing.
const carArtwork = (url: string | undefined): string | undefined =>
  url ? (cachedCarArtwork(url) ?? url) : undefined;

const trackToNowPlaying = (
  track: QueueEntry | null,
): NowPlayingPayload | null => {
  if (!track) return null;
  return {
    id: track.id,
    // Coerce empty strings (local files without tags/art) to undefined so the
    // native car layer doesn't try to parse "" as an artwork URL.
    title: track.title || undefined,
    artist: track.artist || undefined,
    album: track.album || undefined,
    artworkUrl: carArtwork(track.artwork || undefined),
    durationMs: Math.round((track.duration ?? 0) * 1000),
  };
};

// Every section of the tree swallows its own errors, so a build that ran with
// the server unreachable still returns a full set of tabs and section shells —
// all of them empty. Pushing that would overwrite the native disk cache, which
// is the only tree a cold car session has to show, with an unusable one. The
// snapshot is populated exclusively from server responses, so it is the honest
// test of whether the build actually got anything back.
const builtNothing = () => {
  const snap = getSnapshot();
  return (
    snap.tracks.size === 0 &&
    snap.albums.size === 0 &&
    snap.playlists.size === 0
  );
};

// Fingerprint of everything buildBrowseTree() reads out of local state. The
// store subscriptions below are unselective — they fire on every set(), and
// most of those change nothing the tree renders — while a rebuild costs a burst
// of server requests (album lists, playlists, starred, plus per-album and
// per-artist prefetches). Cheap to compute, so compare before spending it.
const rebuildSignature = () => {
  const {
    isAuthenticated,
    serverId,
    url,
    username,
    serverType,
    subsonicSalt,
    subsonicToken,
    useTokenAuth,
    password,
    jellyfinAccessToken,
  } = useAuthBase.getState();
  const podcasts = usePodcasts.getState();
  const podcastsEnabled = Boolean(
    podcasts.taddyPodcastsApiKey && podcasts.taddyPodcastsUserId,
  );
  return JSON.stringify([
    isAuthenticated,
    serverId,
    url,
    username,
    serverType,
    // Every cover URL baked into the tree carries the session's credentials
    // (`t`/`s`, or `p` when token auth is off — see utils/artwork.ts), and the
    // salt is regenerated on every login while url/username stay identical.
    // Without these, signing out and back in would keep a tree whose artwork
    // all 401s.
    subsonicSalt,
    subsonicToken,
    useTokenAuth,
    password,
    jellyfinAccessToken,
    // The tree is built with translated section titles, so a locale change has
    // to invalidate it.
    i18n.language,
    useRecentPlays
      .getState()
      .recentPlays.map((p) => [p.id, p.type, p.title, p.coverArt]),
    podcastsEnabled,
    podcastsEnabled
      ? podcastFavoritesForScope(
          podcasts.favoritePodcasts,
          currentAuthScope(),
        ).map((p) => [p.uuid, p.name, p.authorName, p.imageUrl])
      : null,
  ]);
};

let started = false;

export function startCarAutoSession() {
  if (started) return;
  started = true;
  void boot();
}

async function boot() {
  try {
    await wire();
  } catch (e) {
    log("session wiring threw", e);
  } finally {
    // Releases any tap the car parked while this runtime was booting. It has to
    // run even when the wiring above blew up: native gates every car intent on
    // this call, so skipping it would leave the head unit permanently mute with
    // no way back short of killing the process.
    CarAutoBridge.notifyReady();
  }
}

async function wire() {
  if (Platform.OS === "ios") setupCarPlay();
  if (!CarAutoBridge.available && Platform.OS !== "ios") return;

  CarAutoBridge.setVerbose(__DEV__);

  // The mirrored covers belong to the server being left, and every one is
  // re-derivable — same reasoning as the lock screen's mirror in
  // services/player.ts.
  registerLogoutHandler(clearCarArtworkCache);

  // A headless boot renders nothing under app/, so the startup work the React
  // tree normally owns has to happen here: the saved locale (or the tree would
  // be English, and setNodes would overwrite the native disk cache with it), the
  // scoped stores playback reads from, and the audio mode that keeps playback
  // alive in the background. All are no-ops once the UI has done them.
  // Individually guarded: a failure in any of them must still leave the car
  // listeners below registered, degraded rather than dead.
  await Promise.allSettled([
    Promise.resolve().then(() => applyStartupLocale()),
    hydratePlaybackStores(),
    configurePlayback(),
  ]);

  let timer: ReturnType<typeof setTimeout> | null = null;
  // Only ever set after a *complete* tree was actually pushed, so a build that
  // failed, came back empty or came back partial (offline, server unreachable,
  // a section that timed out) stays retryable.
  let pushedSignature: string | null = null;
  let pushedAt = 0;
  let building = false;
  let rebuildQueued = false;
  // Bumped on every push. The artwork mirror below runs after the tree is
  // already in the car's hands and can easily outlive it (hundreds of covers vs
  // a rebuild triggered by a track change), so its re-push has to prove the tree
  // it localised is still the current one.
  let treeGeneration = 0;

  const rebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(runRebuild, REBUILD_DEBOUNCE_MS);
  };

  const runRebuild = async () => {
    // The debounce only delays the *start* of a build; the build itself is
    // dozens of sequential requests and routinely outlives the next trigger.
    // Two of them running at once would interleave their writes to the shared
    // snapshot play.ts resolves taps against, and could push the older tree
    // last — so serialize, and re-run once for whatever arrived meanwhile.
    if (building) {
      rebuildQueued = true;
      return;
    }
    const { isAuthenticated, url, username, serverType } =
      useAuthBase.getState();
    // The on-device library has no url/username, so gate on the session
    // being authenticated and only require credentials for remote servers.
    if (!isAuthenticated) return log("rebuild skipped: not authenticated");
    if (serverType !== "local" && (!url || !username)) {
      return log("rebuild skipped: no credentials");
    }
    const signature = rebuildSignature();
    if (
      signature === pushedSignature &&
      Date.now() - pushedAt < REBUILD_TTL_MS
    ) {
      return;
    }
    building = true;
    try {
      log("rebuild: building tree");
      const build = await buildBrowseTree().catch((e) => {
        log("buildBrowseTree threw", e);
        return null;
      });
      if (!build) return;
      // Silence here would be indistinguishable from a build that never
      // finished — and this guard dropping a good tree is the one way it can be
      // wrong, so it has to say so.
      if (builtNothing()) return log("rebuild skipped: build returned nothing");
      log("rebuild: pushing tree");
      // A partial tree is still worth pushing — it beats the stale native disk
      // cache — but it must not pin its signature, or the sections the server
      // failed to answer would stay empty for the life of the process.
      if (build.complete) {
        pushedSignature = signature;
        pushedAt = Date.now();
      } else {
        pushedSignature = null;
        log("rebuild: build incomplete, staying retryable");
      }
      const generation = ++treeGeneration;
      if (CarAutoBridge.available) CarAutoBridge.setNodes(build.tree);
      if (Platform.OS === "ios") updateCarPlayTree(build.tree);
      // Deliberately after the push and not awaited: the car gets a usable tree
      // immediately, and covers land as they're mirrored. Blocking the push on a
      // few hundred image fetches would leave a cold car session staring at an
      // empty screen for as long as they take.
      void localizeTreeArtwork(build.tree)
        .then((changed) => {
          if (!changed || generation !== treeGeneration) return;
          log("rebuild: re-pushing tree with local artwork");
          if (CarAutoBridge.available) CarAutoBridge.setNodes(build.tree);
          if (Platform.OS === "ios") updateCarPlayTree(build.tree);
        })
        .catch((e) => log("localizeTreeArtwork threw", e));
    } finally {
      building = false;
      if (rebuildQueued) {
        rebuildQueued = false;
        rebuild();
      }
    }
  };

  useAuthBase.subscribe(rebuild);
  useRecentPlays.subscribe(rebuild);
  usePodcasts.subscribe(rebuild);
  i18n.on("languageChanged", rebuild);
  subscribeEffectiveOnline(() => {
    // Connectivity is invisible to the fingerprint, so a tree built while the
    // server was unreachable would otherwise never be repaired. Drop it on the
    // way back up and rebuild from a server that can actually answer.
    if (!getIsEffectivelyOnline()) return;
    pushedSignature = null;
    rebuild();
  });

  rebuild();

  // === Mirror current track + queue + playback state to native ===
  let lastTrackId: string | null = null;
  let lastQueueSig: string | null = null;
  let lastQueueIndex: number | null = null;
  // One fetch per track change, and only when the cover isn't mirrored already.
  // Re-pushes so the head unit swaps the remote URL it was given for the local
  // file — the only artwork that survives a server it can't authenticate to.
  const mirrorNowPlayingArtwork = async (track: QueueEntry | null) => {
    const remote = track?.artwork;
    if (!remote || cachedCarArtwork(remote)) return;
    const local = await ensureCarArtwork(remote).catch(() => undefined);
    if (!local) return;
    // The track moved on while the fetch was in flight; the push this would
    // refresh is no longer the one on screen.
    if (useQueue.getState().getCurrent()?.id !== track?.id) return;
    CarAutoBridge.setNowPlaying(trackToNowPlaying(track));
  };

  const pushNowPlaying = () => {
    if (!CarAutoBridge.available) return;
    const current = useQueue.getState().getCurrent();
    const id = current?.id ?? null;
    if (id === lastTrackId) return;
    lastTrackId = id;
    CarAutoBridge.setNowPlaying(trackToNowPlaying(current));
    void mirrorNowPlayingArtwork(current);
  };

  const pushQueue = () => {
    if (!CarAutoBridge.available) return;
    const q = useQueue.getState();
    const tracks = q.queue
      .map(trackToNowPlaying)
      .filter((t): t is NowPlayingPayload => t != null);
    const idx = q.currentIndex ?? 0;
    // Only re-push the full track list when its contents actually changed;
    // a plain skip just moves the cursor on the already-mirrored queue.
    const sig = tracks.map((t) => t.id).join("|");
    if (sig !== lastQueueSig) {
      lastQueueSig = sig;
      lastQueueIndex = idx;
      CarAutoBridge.setQueue({ tracks, currentIndex: idx });
      return;
    }
    if (idx !== lastQueueIndex) {
      lastQueueIndex = idx;
      CarAutoBridge.setQueueIndex(idx);
    }
  };

  const pushPlaybackState = () => {
    if (!CarAutoBridge.available) return;
    const snap = getPlaybackSnapshot();
    const q = useQueue.getState();
    const repeatMode = q.repeatMode;
    CarAutoBridge.setPlaybackState({
      isPlaying: snap.playing,
      positionMs: Math.round((snap.currentTime ?? 0) * 1000),
      shuffle: q.shuffle,
      repeatMode,
    });
  };

  pushNowPlaying();
  pushQueue();
  pushPlaybackState();

  useQueue.subscribe((state, prev) => {
    const curId =
      state.currentIndex != null ? state.queue[state.currentIndex]?.id : null;
    const prevId =
      prev.currentIndex != null ? prev.queue[prev.currentIndex]?.id : null;
    if (curId !== prevId) pushNowPlaying();
    if (
      state.queue !== prev.queue ||
      state.currentIndex !== prev.currentIndex
    ) {
      pushQueue();
    }
    if (
      state.shuffle !== prev.shuffle ||
      state.repeatMode !== prev.repeatMode
    ) {
      pushPlaybackState();
    }
  });

  CarAutoBridge.onPlay(async (mediaId, parentId) => {
    const played = await handleBrowsePlay(mediaId, parentId);
    if (played) return;
    // Native flips the proxy player to the tapped item optimistically, so a tap
    // we couldn't resolve (signed out, offline, unknown id) would leave the head
    // unit sitting on a phantom playing track. Push the real state back.
    lastTrackId = null;
    pushNowPlaying();
    pushPlaybackState();
  });

  subscribePlaybackState(pushPlaybackState);

  // Throttled position pulse so AA's timeline keeps advancing even though
  // we don't drive a real Player.
  setInterval(pushPlaybackState, PLAYBACK_PUSH_INTERVAL_MS);

  // === Transport events from AA → drive expo-audio ===
  CarAutoBridge.onTransport((event) => {
    log(`transport ${event.action}`);
    switch (event.action) {
      case "play":
        play();
        break;
      case "pause":
        pause();
        break;
      case "next":
        skipNext();
        break;
      case "previous":
        skipPrevious();
        break;
      case "seek":
        seekTo((event.value ?? 0) / 1000);
        break;
      case "seekToIndex": {
        const idx = Math.round(event.value ?? 0);
        const q = useQueue.getState();
        // Jump within the existing queue — replaying it would rebuild the
        // order the car is displaying (and re-randomise it under shuffle).
        if (q.queue[idx]) {
          q.setCurrentIndex(idx);
          play();
        }
        break;
      }
      case "shuffle":
        useQueue.getState().setShuffle(Boolean(event.value));
        break;
      case "repeat":
        useQueue.getState().setRepeatMode(event.value);
        break;
      default:
        // Defensive — togglePlayPause for unknown signals if AA ever sends a
        // bare action.
        togglePlayPause();
    }
  });
}
