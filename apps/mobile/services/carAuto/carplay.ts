import { Platform } from "react-native";
import { getChildren } from "./browse";
import { playMediaId } from "./play";
import type { BrowseNode } from "./types";
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

let connected = false;
let registered = false;
const connectionListeners = new Set<(connected: boolean) => void>();

const setConnected = (value: boolean) => {
  if (connected === value) return;
  connected = value;
  for (const listener of connectionListeners) listener(value);
};

export const isCarPlayConnected = () => connected;

export const onCarPlayConnection = (
  listener: (connected: boolean) => void,
): (() => void) => {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
};

const sectionToItems = (nodes: BrowseNode[]) =>
  nodes.map((node) => ({
    text: node.title,
    detailText: node.subtitle,
    image: node.artworkUrl ? { uri: node.artworkUrl } : undefined,
  }));

const buildList = async (
  rn: NonNullable<typeof RN>,
  title: string,
  parentId: string,
): Promise<import("react-native-carplay").ListTemplate> => {
  const nodes = (await getChildren(parentId)) ?? [];
  return new rn.ListTemplate({
    title,
    sections: [{ items: sectionToItems(nodes) }],
    onItemSelect: async ({ index }) => {
      const node = nodes[index];
      if (!node) return;
      if (node.playable && !node.browsable) {
        await playMediaId(node.id);
        return;
      }
      try {
        rn.CarPlay.pushTemplate(await buildList(rn, node.title, node.id), true);
      } catch {}
    },
  });
};

const applyRoot = async () => {
  const rn = loadRn();
  if (!rn || !connected) return;
  try {
    const root = (await getChildren(ROOT_ID)) ?? [];
    const tabs = await Promise.all(
      root.map((tab) => buildList(rn, tab.title, tab.id)),
    );
    rn.CarPlay.setRootTemplate(
      new rn.TabBarTemplate({ templates: tabs, onTemplateSelect: () => {} }),
      false,
    );
  } catch {}
};

export const setupCarPlay = () => {
  const rn = loadRn();
  if (!rn || registered) return () => {};
  registered = true;

  const onConnect = () => {
    setConnected(true);
    void applyRoot();
  };
  const onDisconnect = () => {
    setConnected(false);
  };
  rn.CarPlay.registerOnConnect(onConnect);
  rn.CarPlay.registerOnDisconnect(onDisconnect);
  // A connection made before registration is never re-announced.
  if (rn.CarPlay.connected) onConnect();

  return () => {
    rn.CarPlay.unregisterOnConnect(onConnect);
    rn.CarPlay.unregisterOnDisconnect(onDisconnect);
    registered = false;
  };
};

export const refreshCarPlay = () => {
  void applyRoot();
};
