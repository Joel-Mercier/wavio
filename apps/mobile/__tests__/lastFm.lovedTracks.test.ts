// `user.getLovedTracks` parsing. The interesting cases are all shape quirks of
// Last.fm's format=json output rather than the happy path.
jest.mock("@/services/lastFm/client", () => ({
  callRead: jest.fn(),
  callSigned: jest.fn(),
}));

import { callRead } from "@/services/lastFm/client";
import { fetchLovedTracks } from "@/services/lastFm/user";

const mockCallRead = callRead as jest.Mock;

const rawTrack = (name: string, artist: string, extra = {}) => ({
  name,
  artist: { name: artist },
  date: { uts: "1700000000" },
  ...extra,
});

beforeEach(() => {
  mockCallRead.mockReset();
});

describe("fetchLovedTracks", () => {
  it("requests the username, page and limit as an unsigned read", async () => {
    mockCallRead.mockResolvedValue({ lovedtracks: { track: [] } });

    await fetchLovedTracks({ userName: "someone", page: 3, limit: 50 });

    expect(mockCallRead).toHaveBeenCalledWith(
      "user.getLovedTracks",
      { user: "someone", page: 3, limit: 50 },
      { signal: undefined },
    );
  });

  it("reads a list of tracks", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: {
        track: [rawTrack("Alive", "Pearl Jam"), rawTrack("Black", "Pearl Jam")],
        "@attr": { page: "1", totalPages: "2", total: "70" },
      },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items).toEqual([
      {
        name: "Alive",
        artist: "Pearl Jam",
        mbid: undefined,
        lovedAt: 1700000000,
        url: undefined,
      },
      {
        name: "Black",
        artist: "Pearl Jam",
        mbid: undefined,
        lovedAt: 1700000000,
        url: undefined,
      },
    ]);
    // @attr numbers arrive as strings.
    expect(page).toMatchObject({ page: 1, totalPages: 2, total: 70 });
  });

  it("reads a single loved track, which arrives as an object not an array", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: {
        track: rawTrack("Alive", "Pearl Jam"),
        "@attr": { page: "1", totalPages: "1", total: "1" },
      },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].name).toBe("Alive");
  });

  it("reads an account with no loves at all", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: { "@attr": { total: "0" } },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(1);
  });

  it("drops entries missing a name or an artist", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: {
        track: [
          rawTrack("Alive", "Pearl Jam"),
          { name: "   ", artist: { name: "Pearl Jam" } },
          { name: "Black", artist: {} },
          { name: "Jeremy" },
        ],
      },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items.map((track) => track.name)).toEqual(["Alive"]);
    // With no @attr, the total falls back to what was actually usable.
    expect(page.total).toBe(1);
  });

  it("keeps a track mbid and drops an empty one", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: {
        track: [
          rawTrack("Alive", "Pearl Jam", { mbid: "  mbid-1  " }),
          rawTrack("Black", "Pearl Jam", { mbid: "" }),
        ],
      },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items[0].mbid).toBe("mbid-1");
    expect(page.items[1].mbid).toBeUndefined();
  });

  it("leaves lovedAt undefined when the date is missing or unusable", async () => {
    mockCallRead.mockResolvedValue({
      lovedtracks: {
        track: [
          { name: "Alive", artist: { name: "Pearl Jam" } },
          { name: "Black", artist: { name: "Pearl Jam" }, date: { uts: "0" } },
          {
            name: "Jeremy",
            artist: { name: "Pearl Jam" },
            date: { uts: "nope" },
          },
        ],
      },
    });

    const page = await fetchLovedTracks({ userName: "someone" });

    expect(page.items.map((track) => track.lovedAt)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
