import { Platform } from "react-native";
import { handleBrowsePlay } from "./play";
import type { BrowseNode, BrowseTree } from "./types";

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

// rn-carplay's ListTemplate fires onItemSelect with a row index; we need to
// resolve the index back to a BrowseNode to dispatch the play event.
const buildList = (
  rn: NonNullable<typeof RN>,
  title: string,
  nodes: BrowseNode[],
) =>
  new rn.ListTemplate({
    title,
    sections: [{ items: sectionToItems(nodes) }],
    onItemSelect: async ({ index }) => {
      const node = nodes[index];
      if (node) await handleBrowsePlay(node.id);
    },
  });

const buildRoot = (rn: NonNullable<typeof RN>, tree: BrowseTree) =>
  new rn.TabBarTemplate({
    templates: [
      buildList(rn, "Recently Played", tree.recent),
      buildList(rn, "Playlists", tree.playlists),
      buildList(rn, "Starred", tree.starred),
    ],
    onTemplateSelect: () => {},
  });

const applyTree = () => {
  const rn = loadRn();
  if (!rn || !connected || !currentTree) return;
  try {
    const root = buildRoot(rn, currentTree);
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
