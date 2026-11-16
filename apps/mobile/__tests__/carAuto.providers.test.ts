const mockAlbumListing = jest.fn();
const mockPlaylistListing = jest.fn();
const mockSavedCollectionListing = jest.fn();
let mockOnline = true;

jest.mock("@/services/network", () => ({
  getIsEffectivelyOnline: () => mockOnline,
}));
jest.mock("@/services/carAuto/providers/audiobooks", () => ({}));
jest.mock("@/services/carAuto/providers/downloads", () => ({
  savedCollectionListing: (...args: unknown[]) =>
    mockSavedCollectionListing(...args),
}));
jest.mock("@/services/carAuto/providers/library", () => ({
  albumListing: (...args: unknown[]) => mockAlbumListing(...args),
  playlistListing: (...args: unknown[]) => mockPlaylistListing(...args),
}));
jest.mock("@/services/carAuto/providers/mixes", () => ({}));
jest.mock("@/services/carAuto/providers/podcasts", () => ({}));
jest.mock("@/services/carAuto/providers/radio", () => ({}));
jest.mock("@/services/carAuto/providers/search", () => ({}));
jest.mock("@/services/carAuto/providers/sections", () => ({}));

import { listChildren } from "@/services/carAuto/providers";

const server = { nodes: [{ id: "server", title: "server", playable: true }] };
const saved = { nodes: [{ id: "saved", title: "saved", playable: true }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockAlbumListing.mockResolvedValue(server);
  mockPlaylistListing.mockResolvedValue(server);
  mockSavedCollectionListing.mockReturnValue(saved);
});

describe("album and playlist listings", () => {
  it("come from the server while it is reachable", async () => {
    expect(await listChildren({ kind: "album", id: "a1" })).toBe(server);
    expect(await listChildren({ kind: "playlist", id: "p1" })).toBe(server);
    expect(mockSavedCollectionListing).not.toHaveBeenCalled();
  });

  it("come from the download when offline", async () => {
    mockOnline = false;

    expect(await listChildren({ kind: "album", id: "a1" })).toBe(saved);
    expect(await listChildren({ kind: "playlist", id: "p1" })).toBe(saved);

    expect(mockSavedCollectionListing).toHaveBeenCalledWith("album", "a1");
    expect(mockSavedCollectionListing).toHaveBeenCalledWith("playlist", "p1");
    expect(mockAlbumListing).not.toHaveBeenCalled();
  });

  it("still ask the server offline when nothing is downloaded", async () => {
    mockOnline = false;
    mockSavedCollectionListing.mockReturnValue(null);

    expect(await listChildren({ kind: "album", id: "a1" })).toBe(server);
  });
});
