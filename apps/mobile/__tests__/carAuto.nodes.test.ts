let mockCollectionTap = "open";

jest.mock("@/config/i18n", () => ({ t: (key: string) => key }));
jest.mock("@/services/libraryContext", () => ({
  currentLibraryCapabilities: () => ({ offlineDownload: true }),
}));
jest.mock("@/stores/carAuto", () => ({
  carAutoSettings: () => ({
    itemActions: {},
    collectionTap: mockCollectionTap,
    displayStyles: {
      albums: "grid",
      playlists: "list",
      artists: "list",
      genres: "list",
    },
  }),
}));
jest.mock("@/stores/offline", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      downloadedCollections: {},
      isTrackDownloaded: () => false,
    }),
  },
}));
jest.mock("@/utils/artwork", () => ({ artworkUrl: (id: string) => id }));
jest.mock("@/services/offline/collections", () => ({}));
jest.mock("@/services/carAuto/providers/library", () => ({}));

import { albumNode, artistNode, playlistNode } from "@/services/carAuto/nodes";
import { downloadsListing } from "@/services/carAuto/providers/downloads";

const collections = () => [
  albumNode({ id: "a", name: "A" } as never),
  playlistNode({ id: "p", name: "P" } as never),
  artistNode({ id: "r", name: "R" }),
  ...downloadsListing().nodes,
];

// Android Auto plays a node flagged both playable and browsable instead of
// opening it, so by default the driver picks the track to start from.
describe("tapping a collection", () => {
  afterEach(() => {
    mockCollectionTap = "open";
  });

  it("opens it by default", () => {
    for (const node of collections()) {
      expect(node.browsable).toBe(true);
      expect(node.playable).toBe(false);
    }
  });

  it("plays it when the driver chose that", () => {
    mockCollectionTap = "play";
    const playable = collections().filter((node) => node.playable);
    expect(playable.map((node) => node.id)).toEqual([
      "album:a",
      "playlist:p",
      "artist:r",
      "downloads:songs",
    ]);
  });
});
