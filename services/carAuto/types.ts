export type BrowseNode = {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  playable: boolean;
  // UI hint for browsable nodes — "list" or "grid". Native maps this to the
  // Android Auto content-style extras.
  contentStyle?: "list" | "grid";
};

// Flat parent→children map. Native looks up children by parentId; the root
// children live under ROOT_ID. JS owns the entire hierarchy.
export type BrowseTree = Record<string, BrowseNode[]>;

export const ROOT_ID = "root";
