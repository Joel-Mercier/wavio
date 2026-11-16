// Jellyfin keeps a playlist's description in the item's Overview. The playlist
// endpoint ignores it, so it is written through the admin-only item update,
// which replaces every editable field with the body it is sent.
const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock("@/services/jellyfin", () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    delete: jest.fn(),
  },
  getDeviceId: () => "device",
}));

jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => ({ jellyfinUserId: "user" }) },
}));

import {
  getCapabilities,
  sessionCapabilities,
} from "@/services/backend/capabilities";
import { mapBaseItemToPlaylist } from "@/services/jellyfin/mappers";
import { updatePlaylist } from "@/services/jellyfin/playlists";

const ITEM = {
  Id: "p1",
  Name: "Mix",
  Overview: "old",
  Genres: ["House"],
  LockedFields: [],
  ChildCount: 2,
};

describe("jellyfin playlist description", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPost.mockResolvedValue({ data: {} });
    mockGet.mockResolvedValue({ data: ITEM });
  });

  it("reads Overview as the playlist comment", () => {
    expect(mapBaseItemToPlaylist(ITEM).comment).toBe("old");
    expect(
      mapBaseItemToPlaylist({ ...ITEM, Overview: "" }).comment,
    ).toBeUndefined();
  });

  it("writes the whole item back with only Overview changed", async () => {
    await updatePlaylist("p1", { comment: "new" });
    expect(mockGet).toHaveBeenCalledWith("/Users/user/Items/p1");
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/Items/p1", {
      ...ITEM,
      Overview: "new",
    });
  });

  it("writes nothing when the description is unchanged", async () => {
    await updatePlaylist("p1", { comment: "old" });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("treats a missing Overview as an empty description", async () => {
    mockGet.mockResolvedValue({ data: { ...ITEM, Overview: undefined } });
    await updatePlaylist("p1", { comment: "" });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("leaves Overview alone when only the name changes", async () => {
    await updatePlaylist("p1", { name: "Renamed" });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/Playlists/p1", { Name: "Renamed" });
  });

  it("offers description editing to jellyfin admins only", () => {
    expect(getCapabilities("jellyfin").playlistDescription).toBe(false);
    const session = { serverType: "jellyfin", authMethod: "password" } as const;
    expect(
      sessionCapabilities({ ...session, isAdmin: true }).playlistDescription,
    ).toBe(true);
    expect(
      sessionCapabilities({ ...session, isAdmin: false }).playlistDescription,
    ).toBe(false);
    expect(
      sessionCapabilities({
        serverType: "navidrome",
        authMethod: "password",
        isAdmin: false,
      }).playlistDescription,
    ).toBe(true);
  });
});
