export type ContentStyle = "list" | "grid" | "categoryList" | "categoryGrid";

export type CarIcon =
  | "home"
  | "library"
  | "downloads"
  | "recent"
  | "favorites"
  | "playlists"
  | "albums"
  | "artists"
  | "genres"
  | "radio"
  | "mixes"
  | "podcasts"
  | "audiobooks"
  | "songs"
  | "search"
  | "shuffle";

export type ItemAction =
  | "favoriteAdd"
  | "favoriteRemove"
  | "radio"
  | "playNext"
  | "addToQueue"
  | "shuffle"
  | "download";

// The in-app placeholder glyph for an item without a usable cover.
export type ArtFallback =
  | "album"
  | "artist"
  | "playlist"
  | "track"
  | "radio"
  | "podcast"
  | "audiobook";

export type DownloadState = "downloaded" | "downloading" | "notDownloaded";

export type BrowseNode = {
  id: string;
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  artFallback?: ArtFallback;
  playable: boolean;
  browsable?: boolean;
  childrenStyle?: ContentStyle;
  itemStyle?: ContentStyle;
  groupTitle?: string;
  icon?: CarIcon;
  actions?: ItemAction[];
  download?: DownloadState;
  explicit?: boolean;
  completion?: number;
};

export const ROOT_ID = "root";
