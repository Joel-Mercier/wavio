import { Platform } from "react-native";
import { handleBrowsePlay } from "./play";
import type { BrowseNode, BrowseTree } from "./types";
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

let currentTree: BrowseTree | null = null;
let connected = false;
let registered = false;

const sectionToItems = (nodes: BrowseNode[]) =>
  nodes.map((node) => ({
    text: node.title,
    detailText: node.subtitle,
    image: node.artworkUrl ? { uri: node.artworkUrl } : undefined,
  }));

// Push or play depending on the node type. CarPlay's stack handles back nav.
const buildList = (
  rn: NonNullable<typeof RN>,
  title: string,
  parentId: string,
): import("react-native-carplay").ListTemplate => {
  const nodes = currentTree?.[parentId] ?? [];
  return new rn.ListTemplate({
    title,
    sections: [{ items: sectionToItems(nodes) }],
    onItemSelect: async ({ index }) => {
      const node = nodes[index];
      if (!node) return;
      if (node.playable) {
        await handleBrowsePlay(node.id, parentId);
        return;
      }
      try {
        const child = buildList(rn, node.title, node.id);
        rn.CarPlay.pushTemplate(child, true);
      } catch {}
    },
  });
};

const buildRoot = (rn: NonNullable<typeof RN>) => {
  const root = currentTree?.[ROOT_ID] ?? [];
  const tabs = root.map((tab) => buildList(rn, tab.title, tab.id));
  return new rn.TabBarTemplate({
    templates: tabs,
    onTemplateSelect: () => {},
  });
};

const applyTree = () => {
  const rn = loadRn();
  if (!rn || !connected || !currentTree) return;
  try {
    const root = buildRoot(rn);
    rn.CarPlay.setRootTemplate(root, false);
  } catch {}
};

export const setupCarPlay = () => {
  const rn = loadRn();
  if (!rn || registered) return () => {};
  registered = true;

  const onConnect = () => {
    connected = true;
    applyTree();
  };
  const onDisconnect = () => {
    connected = false;
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
