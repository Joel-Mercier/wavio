import { Platform } from "react-native";
import i18n from "@/config/i18n";
import { seekBy } from "@/services/player";
import { handleBrowsePlay } from "./play";
import type { BrowseTree } from "./types";
import { ROOT_ID } from "./types";

// Lazy require so Android (and bundling environments without the native
// module installed) don't try to load the iOS-only library at import time.
let RN: typeof import("react-native-carplay") | null = null;
const loadRn = () => {
  if (RN || Platform.OS !== "ios") return RN;
  try {
    RN = require("react-native-carplay");
  } catch {
    RN = null;
  }
  return RN;
};

type Rn = typeof import("react-native-carplay");
type ListTemplate = import("react-native-carplay").ListTemplate;
type NowPlayingTemplate = import("react-native-carplay").NowPlayingTemplate;

// Same step as the phone's OS controls. CarPlay's progress bar can't be
// scrubbed before iOS 27, so these buttons are the only way to seek in the car.
const SEEK_STEP_SECONDS = 10;

// What the head unit shows while there is no tree to apply: the session is
// building one ("loading") or there is no session to build from ("signedOut").
export type CarPlayPlaceholder = "loading" | "signedOut";

let currentTree: BrowseTree | null = null;
let placeholder: CarPlayPlaceholder = "loading";
let appliedPlaceholder: CarPlayPlaceholder | null = null;
// The tab lists currently installed as the root, keyed by tab id. Kept so a
// re-push can refresh their rows in place: setRootTemplate resets the head
// unit's navigation stack, and the tree is re-pushed on every track change
// (recent plays are part of its signature) — replacing the root each time
// would throw the driver out of Now Playing or a list they were browsing.
let rootTabs: Map<string, ListTemplate> | null = null;
let nowPlaying: NowPlayingTemplate | null = null;
let registered = false;

const log = (message: string, error: unknown) => {
  if (__DEV__) console.log(`[carplay] ${message}`, error);
};

const sectionsFor = (parentId: string) => [
  {
    items: (currentTree?.[parentId] ?? []).map((node) => {
      // The mirrored copy first: it needs no round trip and no credentials.
      // The server URL is the fallback, for covers the mirror hasn't reached.
      const cover = node.localArtworkUrl ?? node.artworkUrl;
      return {
        text: node.title,
        detailText: node.subtitle,
        image: cover ? { uri: cover } : undefined,
      };
    }),
  },
];

// Push or play depending on the node type. CarPlay's stack handles back nav.
// Rows are resolved against the current tree at tap time, not captured at
// build time, because the list's sections may have been refreshed since.
const buildList = (rn: Rn, title: string, parentId: string): ListTemplate =>
  new rn.ListTemplate({
    title,
    sections: sectionsFor(parentId),
    onItemSelect: async ({ index }) => {
      const node = currentTree?.[parentId]?.[index];
      if (!node) return;
      if (node.playable) {
        await handleBrowsePlay(node.id, parentId);
        return;
      }
      try {
        rn.CarPlay.pushTemplate(buildList(rn, node.title, node.id), true);
      } catch (e) {
        log("pushTemplate failed", e);
      }
    },
  });

// Configures the system-owned Now Playing template (a singleton that outlives
// scene connections). Created once: every Template registers emitter listeners
// keyed on its id and never removes them, so a second instance with the same
// id would fire onButtonPressed twice per tap.
const installNowPlaying = (rn: Rn) => {
  if (nowPlaying) return;
  nowPlaying = new rn.NowPlayingTemplate({
    id: "now-playing",
    buttons: [
      {
        id: "seek-back",
        type: "image",
        image: require("@/assets/images/carplay/seek-back-10.png"),
      },
      {
        id: "seek-forward",
        type: "image",
        image: require("@/assets/images/carplay/seek-forward-10.png"),
      },
    ],
    onButtonPressed: ({ id }) => {
      seekBy(id === "seek-back" ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
    },
  });
};

const installRoot = (rn: Rn) => {
  const tabs = new Map<string, ListTemplate>();
  for (const tab of currentTree?.[ROOT_ID] ?? []) {
    tabs.set(tab.id, buildList(rn, tab.title, tab.id));
  }
  rn.CarPlay.setRootTemplate(
    new rn.TabBarTemplate({
      templates: [...tabs.values()],
      onTemplateSelect: () => {},
    }),
    false,
  );
  rootTabs = tabs;
  appliedPlaceholder = null;
};

// True when the installed root can absorb the current tree without being
// replaced: same tabs, in the same order.
const canRefreshRoot = () => {
  const tabs = currentTree?.[ROOT_ID] ?? [];
  if (!rootTabs || rootTabs.size !== tabs.length) return false;
  return [...rootTabs.keys()].every((id, i) => tabs[i]?.id === id);
};

// The library owns the session state (it also probes for a head unit that
// attached before it was required), so it is the one flag every gate reads —
// a module-local copy could only ever disagree with it.
export const isCarPlayConnected = (): boolean =>
  loadRn()?.CarPlay.connected ?? false;

const buildPlaceholder = (rn: Rn) =>
  new rn.ListTemplate({
    title: "Wavio",
    sections: [],
    emptyViewTitleVariants: [
      i18n.t(
        placeholder === "signedOut"
          ? "app.carAuto.signedOutPlaceholder"
          : "app.carAuto.loadingPlaceholder",
      ),
    ],
    emptyViewSubtitleVariants:
      placeholder === "signedOut"
        ? [i18n.t("app.carAuto.signedOutPlaceholderDetail")]
        : [],
  });

const applyTree = () => {
  const rn = loadRn();
  if (!rn?.CarPlay.connected) return;
  try {
    if (currentTree) {
      if (canRefreshRoot() && rootTabs) {
        for (const [id, list] of rootTabs) list.updateSections(sectionsFor(id));
      } else {
        installRoot(rn);
      }
      return;
    }
    if (appliedPlaceholder === placeholder) return;
    rn.CarPlay.setRootTemplate(buildPlaceholder(rn), false);
    rootTabs = null;
    appliedPlaceholder = placeholder;
  } catch (e) {
    log("applyTree failed", e);
  }
};

export const setupCarPlay = (options?: {
  onConnect?: () => void;
  onDisconnect?: () => void;
}) => {
  const rn = loadRn();
  if (!rn || registered) return () => {};
  registered = true;

  const onConnect = () => {
    try {
      installNowPlaying(rn);
    } catch (e) {
      log("installNowPlaying failed", e);
    }
    applyTree();
    options?.onConnect?.();
  };
  // Templates belong to the interface controller that just went away; the
  // next connect gets a fresh root.
  const onDisconnect = () => {
    rootTabs = null;
    appliedPlaceholder = null;
    options?.onDisconnect?.();
  };
  rn.CarPlay.registerOnConnect(onConnect);
  rn.CarPlay.registerOnDisconnect(onDisconnect);

  return () => {
    rn.CarPlay.unregisterOnConnect(onConnect);
    rn.CarPlay.unregisterOnDisconnect(onDisconnect);
    registered = false;
  };
};

export const updateCarPlayTree = (tree: BrowseTree) => {
  currentTree = tree;
  applyTree();
};

// Forgets the held tree and shows the placeholder instead, so a head unit
// never keeps browsing a session that is gone; the placeholder also stands in
// on a connect that happens before any tree exists.
export const clearCarPlayTree = (kind: CarPlayPlaceholder) => {
  currentTree = null;
  placeholder = kind;
  applyTree();
};
