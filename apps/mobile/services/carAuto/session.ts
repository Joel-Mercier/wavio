import { AppRegistry, Platform } from "react-native";
import i18n from "@/config/i18n";
import {
  getIsEffectivelyOnline,
  subscribeEffectiveOnline,
} from "@/services/network";
import {
  configurePlayback,
  pause,
  play,
  savePlaybackPosition,
  seekBy,
  seekTo,
  skipNext,
  skipPrevious,
  toggleCurrentTrackFavorite,
  togglePlayPause,
} from "@/services/player";
import { flushPlayQueue, initPlayQueueSync } from "@/services/playQueueSync";
import {
  applyStartupLocale,
  hydratePlaybackStores,
} from "@/services/startupHydration";
import { useAudiobookshelfBase } from "@/stores/audiobookshelf";
import {
  currentAuthScope,
  registerLogoutHandler,
  useAuthBase,
} from "@/stores/auth";
import { useCarAutoBase } from "@/stores/carAuto";
import useOffline from "@/stores/offline";
import usePodcasts from "@/stores/podcasts";
import useQueue from "@/stores/queue";
import useRecentPlays from "@/stores/recentPlays";
import { radioFromCurrentTrack, runItemAction } from "./actions";
import { startArtworkHeaders } from "./artwork";
import { CarAutoBridge } from "./bridge";
import {
  cachedListing,
  clearListings,
  getChildren,
  invalidateListings,
} from "./browse";
import { refreshCarPlay, setupCarPlay } from "./carplay";
import { isCarConnected, subscribeCarConnection } from "./connection";
import { startLabels } from "./labels";
import { encodeMediaId } from "./mediaId";
import {
  pushAll,
  pushError,
  queueOffset,
  startPlaybackMirror,
} from "./nowPlaying";
import { playMediaId } from "./play";
import { ROOT_ID } from "./types";
import { playFromSearch } from "./voice";

const IS_CARPLAY = Platform.OS === "ios";
const CAR_SESSION_TASK = "WavioCarSession";
const SEEK_STEP_SECONDS = 30;
const REFRESH_DEBOUNCE_MS = 1500;
const SEARCH_SETTLE_MS = 400;

const log = (message: string, error?: unknown) => {
  if (!__DEV__) return;
  if (error !== undefined) console.log(`[carauto] ${message}`, error);
  else console.log(`[carauto] ${message}`);
};

const holdUntilCarDisconnects = () =>
  new Promise<void>((resolve) => {
    if (!CarAutoBridge.isCarConnected()) return resolve();
    const unsubscribe = CarAutoBridge.onCarConnection((connected) => {
      if (connected) return;
      unsubscribe();
      resolve();
    });
  });

async function answerChildren(parentId: string, fresh = false) {
  const nodes = await getChildren(parentId, { fresh }).catch(() => null);
  CarAutoBridge.setChildren(parentId, nodes);
}

async function prefetchTopLevel() {
  const root = await getChildren(ROOT_ID).catch(() => null);
  CarAutoBridge.setChildren(ROOT_ID, root);
  for (const tab of root ?? []) void answerChildren(tab.id);
}

// `purge` is for a change of account: the listings native holds belong to the
// previous one, and serving them while JS refetches would show its library.
function resetBrowse({ purge = false }: { purge?: boolean } = {}) {
  clearListings();
  if (IS_CARPLAY) return refreshCarPlay();
  if (purge) CarAutoBridge.clearChildren();
  else CarAutoBridge.invalidateChildren(null);
  if (isCarConnected()) void prefetchTopLevel();
}

function refetchParents(ids: string[]) {
  const opened = ids.filter((id) => cachedListing(id) !== undefined);
  invalidateListings((id) => ids.includes(id));
  CarAutoBridge.invalidateChildren(ids);
  if (!isCarConnected()) return;
  for (const id of opened) void answerChildren(id, true);
}

let refreshRequest = 0;
const pendingRefresh = new Set<string>();

function refreshParents(matches: (parentId: string) => boolean, ids: string[]) {
  invalidateListings(matches);
  if (IS_CARPLAY) return;
  for (const id of ids) pendingRefresh.add(id);
  const request = ++refreshRequest;
  void CarAutoBridge.delay(REFRESH_DEBOUNCE_MS).then(() => {
    if (request !== refreshRequest) return;
    const parents = [...pendingRefresh];
    pendingRefresh.clear();
    CarAutoBridge.invalidateChildren(parents);
    if (!isCarConnected()) return;
    for (const parentId of parents) void answerChildren(parentId, true);
  });
}

function wireBrowse() {
  CarAutoBridge.onChildrenRequest((parentId) => {
    void answerChildren(parentId);
  });

  // The car asks on every keystroke. Only a query the driver stopped typing
  // at reaches the server; the ones typed past are answered empty at once, or
  // native would keep them pending and never ask JS for that text again.
  let latestSearch = "";
  CarAutoBridge.onSearchRequest(async (query) => {
    latestSearch = query;
    const parentId = encodeMediaId({ kind: "search", query });
    if (!cachedListing(parentId)) {
      await CarAutoBridge.delay(SEARCH_SETTLE_MS);
      if (latestSearch !== query) {
        CarAutoBridge.setSearchResults(query, []);
        return;
      }
    }
    const nodes = await getChildren(parentId).catch((e) => {
      log("search failed", e);
      return null;
    });
    CarAutoBridge.setSearchResults(query, nodes);
  });

  let scope = currentAuthScope();
  useAuthBase.subscribe((state, prev) => {
    const next = currentAuthScope();
    if (
      next !== scope ||
      state.isAuthenticated !== prev.isAuthenticated ||
      state.serverType !== prev.serverType
    ) {
      scope = next;
      resetBrowse({ purge: true });
    }
  });
  useCarAutoBase.subscribe(() => resetBrowse());
  i18n.on("languageChanged", () => resetBrowse());
  subscribeEffectiveOnline(() => {
    if (getIsEffectivelyOnline()) resetBrowse();
  });

  const sectionId = (
    key: "recent" | "downloads" | "podcasts" | "library" | "audiobooks",
  ) => encodeMediaId({ kind: "section", key });
  useRecentPlays.subscribe((state, prev) => {
    if (state.recentPlays === prev.recentPlays) return;
    refreshParents(
      (id) =>
        id === sectionId("recent") ||
        id.startsWith("row:mixes") ||
        id === encodeMediaId({ kind: "section", key: "mixes" }),
      [sectionId("recent")],
    );
  });
  useOffline.subscribe((state, prev) => {
    if (
      state.downloadedCollections === prev.downloadedCollections &&
      state.downloadedTracks === prev.downloadedTracks
    ) {
      return;
    }
    const downloads = [
      encodeMediaId({ kind: "downloads", of: "albums" }),
      encodeMediaId({ kind: "downloads", of: "playlists" }),
      encodeMediaId({ kind: "downloads", of: "songs" }),
    ];
    refreshParents(
      (id) => id.startsWith("downloads:") || id.startsWith("offline:"),
      downloads.filter((id) => cachedListing(id) !== undefined),
    );
  });
  usePodcasts.subscribe((state, prev) => {
    if (state.favoritePodcasts === prev.favoritePodcasts) return;
    refreshParents(
      (id) => id === sectionId("podcasts") || id === ROOT_ID,
      [sectionId("podcasts"), ROOT_ID],
    );
  });
  // Audiobooks is only offered while an Audiobookshelf server is signed in.
  useAudiobookshelfBase.subscribe((state, prev) => {
    if (
      state.isConnected === prev.isConnected &&
      state.serverUrl === prev.serverUrl &&
      state.libraryId === prev.libraryId
    ) {
      return;
    }
    const audiobooks = sectionId("audiobooks");
    const listings = [ROOT_ID, sectionId("library")];
    refreshParents(
      (id) => id === audiobooks || listings.includes(id),
      cachedListing(audiobooks) ? [...listings, audiobooks] : listings,
    );
  });
}

function wirePlayback() {
  // Native shows the tapped row and empties its queue the moment it is tapped,
  // so the mirror is re-sent whole even when nothing changed on this side.
  CarAutoBridge.onPlay(async (mediaId) => {
    await playMediaId(mediaId);
    pushAll();
  });

  CarAutoBridge.onPlaySearch(async (request) => {
    const { query, ...hints } = request;
    log(`voice "${query}"`);
    const played = await playFromSearch(query, hints);
    if (played) {
      pushError(true);
      return;
    }
    pushAll();
    CarAutoBridge.setError({
      code: "setup",
      message: i18n.t("app.carAuto.errors.noResults", { query }),
      transient: true,
    });
  });

  CarAutoBridge.onItemAction(async (requestId, action, mediaId) => {
    const result = await runItemAction(action, mediaId);
    const stale = result.staleParents ?? [];
    const patched = (result.changedParents ?? []).filter(
      (parentId) => !stale.includes(parentId),
    );
    for (const parentId of patched) {
      const listing = cachedListing(parentId);
      if (listing) CarAutoBridge.setChildren(parentId, listing.nodes);
    }
    if (stale.length > 0) refetchParents(stale);
    CarAutoBridge.answerAction(requestId, {
      ok: result.ok,
      message: result.message,
      refreshItem: patched.length ? mediaId : undefined,
      showPlaying: result.showPlaying,
    });
  });

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
        seekTo(event.value / 1000);
        break;
      case "seekBack":
        seekBy(-SEEK_STEP_SECONDS);
        break;
      case "seekForward":
        seekBy(SEEK_STEP_SECONDS);
        break;
      case "seekToIndex": {
        const index = queueOffset() + Math.round(event.value);
        const queue = useQueue.getState();
        if (queue.queue[index]) {
          queue.setCurrentIndex(index);
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
      case "favorite":
        void toggleCurrentTrackFavorite();
        break;
      case "radio":
        void radioFromCurrentTrack().then((started) => {
          if (started) return;
          CarAutoBridge.setError({
            code: "setup",
            message: i18n.t("app.carAuto.errors.radioUnavailable"),
            transient: true,
          });
        });
        break;
      default:
        togglePlayPause();
    }
  });
}

function wireConnection() {
  const onCarConnection = (connected: boolean) => {
    log(`car connected=${connected}`);
    if (!connected) return;
    CarAutoBridge.invalidateChildren(null);
    pushAll();
    void prefetchTopLevel();
  };
  subscribeCarConnection(onCarConnection);
  if (isCarConnected()) onCarConnection(true);
}

// A headless boot mounts nothing under app/, which is what otherwise starts
// queue sync and flushes it on leaving. Without this a queue played in the car
// never reaches the server, and the server's older one replaces it the first
// time the app is opened (issue #285). Started on connect rather than at boot
// so a phone launch keeps waiting for app/'s TLS setup before its restore.
function wireQueueSync() {
  const onCarConnection = (connected: boolean) => {
    if (connected) {
      if (useAuthBase.getState().isAuthenticated) void initPlayQueueSync();
      return;
    }
    savePlaybackPosition();
    flushPlayQueue();
  };
  subscribeCarConnection(onCarConnection);
  if (isCarConnected()) onCarConnection(true);
}

async function wire() {
  if (!CarAutoBridge.available && !IS_CARPLAY) return;

  if (CarAutoBridge.available) {
    CarAutoBridge.setVerbose(__DEV__);
    AppRegistry.registerHeadlessTask(
      CAR_SESSION_TASK,
      () => holdUntilCarDisconnects,
    );
  }

  await Promise.allSettled([
    Promise.resolve().then(() => applyStartupLocale()),
    hydratePlaybackStores(),
    configurePlayback(),
  ]);

  wireBrowse();
  wireQueueSync();
  if (IS_CARPLAY) {
    setupCarPlay();
    return;
  }
  registerLogoutHandler(() => CarAutoBridge.clearArtworkCache());
  startLabels();
  startArtworkHeaders();
  startPlaybackMirror();
  wirePlayback();
  wireConnection();
}

let started = false;

export function startCarAutoSession() {
  if (started) return;
  started = true;
  void (async () => {
    try {
      await wire();
    } catch (e) {
      log("session wiring threw", e);
    } finally {
      CarAutoBridge.notifyReady();
    }
  })();
}
