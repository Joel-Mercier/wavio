export type BrowseNode = {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  playable: boolean;
  children?: BrowseNode[];
};

export type BrowseTree = {
  recent: BrowseNode[];
  playlists: BrowseNode[];
  starred: BrowseNode[];
};

export const ROOT_NODES = {
  recent: { id: "section:recent", title: "Recently Played" },
  playlists: { id: "section:playlists", title: "Playlists" },
  starred: { id: "section:starred", title: "Starred" },
} as const;
