export type BrowseNode = {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  // The mirrored copy of `artworkUrl`, when one exists on disk. Native prefers
  // it (it becomes a content:// URI the car host can always read) and falls back
  // to `artworkUrl` when the file is gone — the mirror lives in the reclaimable
  // cache dir, while the tree snapshot that references it does not.
  localArtworkUrl?: string;
  playable: boolean;
  // UI hint for browsable nodes — "list" or "grid". Native maps this to the
  // Android Auto content-style extras.
  contentStyle?: "list" | "grid";
};

// Flat parent→children map. Native looks up children by parentId; the root
// children live under ROOT_ID. JS owns the entire hierarchy.
export type BrowseTree = Record<string, BrowseNode[]>;

export const ROOT_ID = "root";
