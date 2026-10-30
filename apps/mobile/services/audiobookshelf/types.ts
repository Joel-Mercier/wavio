// Shapes returned by an Audiobookshelf server (checked against v2.37). The
// published API docs stopped at v2.2.5, so these are taken from live responses
// and only carry the fields the app reads.

export interface AbsConfig {
  serverUrl: string;
  accessToken: string;
  refreshToken: string;
}

export interface AbsServerStatus {
  app: string;
  serverVersion: string;
  isInit: boolean;
  authMethods: string[];
}

export interface AbsPermissions {
  download: boolean;
  update: boolean;
  delete: boolean;
  upload: boolean;
  accessAllLibraries: boolean;
}

export interface AbsUser {
  id: string;
  username: string;
  type: "root" | "admin" | "user" | "guest";
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  permissions: AbsPermissions;
  librariesAccessible: string[];
  mediaProgress?: AbsMediaProgress[];
}

export interface AbsLoginResponse {
  user: AbsUser;
  userDefaultLibraryId?: string;
  serverSettings?: { version?: string };
}

export interface AbsLibrary {
  id: string;
  name: string;
  mediaType: "book" | "podcast";
  displayOrder: number;
  icon?: string;
}

export interface AbsAuthorRef {
  id: string;
  name: string;
}

export interface AbsSeriesRef {
  id: string;
  name: string;
  sequence?: string | null;
}

export interface AbsBookMetadata {
  title: string | null;
  subtitle?: string | null;
  authorName?: string;
  narratorName?: string;
  seriesName?: string;
  authors?: AbsAuthorRef[];
  narrators?: string[];
  series?: AbsSeriesRef[] | AbsSeriesRef;
  genres?: string[];
  publishedYear?: string | null;
  publisher?: string | null;
  description?: string | null;
  descriptionPlain?: string | null;
  language?: string | null;
  isbn?: string | null;
  asin?: string | null;
  explicit?: boolean;
  abridged?: boolean;
}

export interface AbsChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface AbsAudioFile {
  index: number;
  ino: string;
  duration: number;
  mimeType: string;
  codec?: string;
  bitRate?: number;
  exclude?: boolean;
  metadata: { filename: string; ext: string; size: number };
}

export interface AbsAudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
  mimeType: string;
  ino?: string;
  metadata?: { filename: string; ext: string; size: number };
}

export interface AbsBookMedia {
  id: string;
  metadata: AbsBookMetadata;
  coverPath?: string | null;
  tags?: string[];
  numTracks?: number;
  numAudioFiles?: number;
  numChapters?: number;
  duration?: number;
  size?: number;
  audioFiles?: AbsAudioFile[];
  chapters?: AbsChapter[];
  tracks?: AbsAudioTrack[];
}

export interface AbsMediaProgress {
  id: string;
  libraryItemId: string;
  episodeId?: string | null;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  hideFromContinueListening?: boolean;
  lastUpdate: number;
  startedAt?: number;
  finishedAt?: number | null;
}

export interface AbsLibraryItem {
  id: string;
  libraryId: string;
  mediaType: "book" | "podcast";
  addedAt: number;
  updatedAt: number;
  isMissing?: boolean;
  isInvalid?: boolean;
  media: AbsBookMedia;
  userMediaProgress?: AbsMediaProgress | null;
  // Present on items returned inside a series shelf / series filter.
  collapsedSeries?: {
    id: string;
    name: string;
    numBooks: number;
  };
}

export interface AbsSeries {
  id: string;
  name: string;
  description?: string | null;
  addedAt?: number;
  books?: AbsLibraryItem[];
  totalDuration?: number;
}

export interface AbsAuthor {
  id: string;
  name: string;
  description?: string | null;
  imagePath?: string | null;
  numBooks?: number;
  libraryItems?: AbsLibraryItem[];
  series?: (AbsSeries & { items?: AbsLibraryItem[] })[];
}

export interface AbsCollection {
  id: string;
  libraryId: string;
  name: string;
  description?: string | null;
  books: AbsLibraryItem[];
}

export type AbsShelf =
  | {
      id: string;
      label: string;
      labelStringKey?: string;
      type: "book";
      entities: AbsLibraryItem[];
    }
  | {
      id: string;
      label: string;
      labelStringKey?: string;
      type: "series";
      entities: (AbsSeries & { books: AbsLibraryItem[] })[];
    }
  | {
      id: string;
      label: string;
      labelStringKey?: string;
      type: "authors";
      entities: AbsAuthor[];
    }
  | {
      id: string;
      label: string;
      labelStringKey?: string;
      type: "podcast" | "episode";
      entities: unknown[];
    };

export interface AbsPage<T> {
  results: T[];
  total: number;
  limit: number;
  page: number;
}

export interface AbsSearchResult {
  book: { libraryItem: AbsLibraryItem; matchKey?: string }[];
  authors: AbsAuthor[];
  series: { series: AbsSeries; books: AbsLibraryItem[] }[];
  narrators: { name: string; numBooks: number }[];
  genres?: { name: string; numItems: number }[];
  tags?: { name: string; numItems: number }[];
}

export interface AbsFilterData {
  authors: AbsAuthorRef[];
  genres: string[];
  tags: string[];
  series: AbsSeriesRef[];
  narrators: string[];
  languages: string[];
  publishers: string[];
  bookCount: number;
}

export interface AbsPlaybackSession {
  id: string;
  libraryItemId: string;
  libraryId: string;
  displayTitle: string;
  displayAuthor: string;
  duration: number;
  currentTime: number;
  playMethod: number;
  chapters: AbsChapter[];
  audioTracks: AbsAudioTrack[];
  libraryItem?: AbsLibraryItem;
}

// A listening session recorded on the device while the server was out of
// reach, uploaded through /api/session/local-all. The server remaps the
// `play_local_` id and fills missing metadata from the library item.
export interface AbsLocalSession {
  id: string;
  libraryItemId: string;
  libraryId: string;
  mediaType: "book";
  displayTitle: string;
  displayAuthor: string;
  duration: number;
  startTime: number;
  currentTime: number;
  timeListening: number;
  startedAt: number;
  updatedAt: number;
  mediaPlayer: string;
  playMethod: number;
  deviceInfo: AbsDeviceInfo;
}

export interface AbsDeviceInfo {
  deviceId: string;
  clientName: string;
  clientVersion: string;
  manufacturer?: string;
  model?: string;
  sdkVersion?: number;
}
