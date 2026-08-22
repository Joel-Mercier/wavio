jest.mock("@/services/backend/searching", () => ({ search3: jest.fn() }));

import { search3 } from "@/services/backend/searching";
import {
  type ExternalTrack,
  matchTracksToLibrary,
} from "@/services/libraryMatch";
import type { Child } from "@/services/openSubsonic/types";

const search3Mock = search3 as jest.Mock;

const song = (over: Partial<Child> & { id: string }): Child =>
  ({
    isDir: false,
    title: "Cascade",
    artist: "The Future Sound of London",
    ...over,
  }) as Child;

const external = (over: Partial<ExternalTrack> = {}): ExternalTrack => ({
  key: over.recordingMbid ?? over.title ?? "k",
  title: "Cascade",
  artist: "The Future Sound of London",
  ...over,
});

/** Answers every query with the same pool. */
const always = (...songs: Child[]) => {
  search3Mock.mockResolvedValue({ searchResult3: { song: songs } });
};

beforeEach(() => {
  search3Mock.mockReset();
});

describe("matchTracksToLibrary", () => {
  it("returns one entry per input, in input order", async () => {
    // Resolve out of order so a race can't accidentally pass.
    const delays: Record<string, number> = { A: 30, B: 0, C: 15 };
    search3Mock.mockImplementation(
      (query: string) =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                searchResult3: { song: [song({ id: query, title: query })] },
              }),
            delays[query] ?? 0,
          ),
        ),
    );

    const result = await matchTracksToLibrary([
      external({ title: "A", artist: "X" }),
      external({ title: "B", artist: "X" }),
      external({ title: "C", artist: "X" }),
    ]);

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.external.title)).toEqual(["A", "B", "C"]);
  });

  it("matches on title and artist with no mbid anywhere", async () => {
    always(song({ id: "lib-1" }));

    const [match] = await matchTracksToLibrary([external()]);

    expect(match.state).toBe("matched");
    expect(match.state === "matched" && match.track.id).toBe("lib-1");
  });

  it("lets an mbid hit beat a higher-scoring fuzzy candidate", async () => {
    const mbid = "61800c28-9089-4ad5-b06a-3abfde90873d";
    always(
      // Identical metadata, so it wins on fuzzy score alone.
      song({ id: "fuzzy" }),
      // Metadata drifted, but the recording id is exact.
      song({
        id: "by-mbid",
        title: "Cascade (2011 Remaster)",
        artist: "FSOL",
        musicBrainzId: mbid,
      }),
    );

    const [match] = await matchTracksToLibrary([
      external({ recordingMbid: mbid }),
    ]);

    expect(match.state === "matched" && match.track.id).toBe("by-mbid");
    expect(match.state === "matched" && match.confidence).toBe(1);
  });

  it("compares mbids case-insensitively", async () => {
    const mbid = "61800c28-9089-4ad5-b06a-3abfde90873d";
    always(
      song({
        id: "x",
        title: "Nothing Alike",
        artist: "Nobody",
        musicBrainzId: mbid.toUpperCase(),
      }),
    );

    const [match] = await matchTracksToLibrary([
      external({ recordingMbid: mbid }),
    ]);

    expect(match.state === "matched" && match.track.id).toBe("x");
  });

  it("rejects the right title by the wrong artist", async () => {
    always(song({ id: "wrong", title: "Cascade", artist: "Some Other Band" }));

    const [match] = await matchTracksToLibrary([external()]);

    expect(match.state).toBe("missing");
  });

  it("rejects the right artist on an unrelated title", async () => {
    always(
      song({
        id: "wrong",
        title: "Papua New Guinea",
        artist: "The Future Sound of London",
      }),
    );

    const [match] = await matchTracksToLibrary([external()]);

    expect(match.state).toBe("missing");
  });

  it("uses duration to separate two otherwise identical candidates", async () => {
    always(
      song({ id: "long", duration: 300 }),
      song({ id: "right", duration: 360 }),
    );

    const [match] = await matchTracksToLibrary([
      external({ durationMs: 360306 }),
    ]);

    expect(match.state === "matched" && match.track.id).toBe("right");
  });

  it("matches a lead-artist tag against a full featuring credit", async () => {
    always(song({ id: "lib-1", title: "Bad Kingdom", artist: "Moderat" }));

    const [match] = await matchTracksToLibrary([
      external({
        title: "Bad Kingdom",
        artist: "Moderat feat. Someone Else",
        primaryArtist: "Moderat",
      }),
    ]);

    expect(match.state === "matched" && match.track.id).toBe("lib-1");
  });

  it("never hands the same library track to two inputs", async () => {
    always(song({ id: "shared", title: "Alive", artist: "Anon" }));

    const result = await matchTracksToLibrary([
      external({ key: "first", title: "Alive", artist: "Anon" }),
      external({ key: "second", title: "Alive", artist: "Anon" }),
    ]);

    expect(result[0].state).toBe("matched");
    // The earlier position claims it; the later one has nothing left.
    expect(result[1].state).toBe("missing");
  });

  it("isolates a search that throws to its own entry", async () => {
    // Both passes for this track fail, so the entry has nothing to fall back on.
    search3Mock.mockImplementation((query: string) => {
      if (query.includes("Boom")) return Promise.reject(new Error("500"));
      return Promise.resolve({
        searchResult3: {
          song: [song({ id: "ok", title: "Fine", artist: "X" })],
        },
      });
    });

    const result = await matchTracksToLibrary([
      external({ title: "Boom", artist: "X" }),
      external({ title: "Fine", artist: "X" }),
    ]);

    expect(result[0].state).toBe("missing");
    expect(result[1].state).toBe("matched");
  });

  describe("second pass", () => {
    it("is skipped when the first pass already matched", async () => {
      always(song({ id: "lib-1" }));

      await matchTracksToLibrary([external()]);

      expect(search3Mock).toHaveBeenCalledTimes(1);
      expect(search3Mock).toHaveBeenCalledWith(
        "Cascade",
        expect.objectContaining({
          songCount: 25,
          albumCount: 0,
          artistCount: 0,
        }),
      );
    });

    it("retries with the artist when the first pass found nothing usable", async () => {
      search3Mock
        .mockResolvedValueOnce({ searchResult3: { song: [] } })
        .mockResolvedValueOnce({
          searchResult3: {
            song: [song({ id: "rescued", title: "Home", artist: "Anon" })],
          },
        });

      const [match] = await matchTracksToLibrary([
        external({ title: "Home", artist: "Anon" }),
      ]);

      expect(search3Mock).toHaveBeenCalledTimes(2);
      expect(search3Mock.mock.calls[0][0]).toBe("Home");
      expect(search3Mock.mock.calls[1][0]).toBe("Anon Home");
      expect(match.state === "matched" && match.track.id).toBe("rescued");
    });

    it("still reports missing when neither pass finds the track", async () => {
      always();

      const [match] = await matchTracksToLibrary([external()]);

      expect(search3Mock).toHaveBeenCalledTimes(2);
      expect(match.state).toBe("missing");
    });

    it("is never attempted on a backend that only searches the title", async () => {
      always();

      const [match] = await matchTracksToLibrary([external()], {
        multiFieldSearch: false,
      });

      expect(search3Mock).toHaveBeenCalledTimes(1);
      expect(match.state).toBe("missing");
    });
  });

  it("strips packaging noise from the query but not punctuation", async () => {
    always(song({ id: "lib-1", title: "Don't Stop", artist: "Anon" }));

    await matchTracksToLibrary([
      external({ title: "Don't Stop (Official Audio)", artist: "Anon" }),
    ]);

    expect(search3Mock.mock.calls[0][0]).toBe("Don't Stop");
  });

  it("keeps at most four searches in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    search3Mock.mockImplementation(
      () =>
        new Promise((resolve) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          setTimeout(() => {
            inFlight -= 1;
            resolve({ searchResult3: { song: [song({ id: "lib-1" })] } });
          }, 5);
        }),
    );

    await matchTracksToLibrary(
      Array.from({ length: 12 }, (_, i) => external({ key: `k${i}` })),
    );

    expect(peak).toBeLessThanOrEqual(4);
  });

  it("issues no search when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      matchTracksToLibrary([external()], { signal: controller.signal }),
    ).rejects.toThrow();
    expect(search3Mock).not.toHaveBeenCalled();
  });

  it("returns an empty list without searching for no input", async () => {
    await expect(matchTracksToLibrary([])).resolves.toEqual([]);
    expect(search3Mock).not.toHaveBeenCalled();
  });

  it("passes the music folder through to the search", async () => {
    always(song({ id: "lib-1" }));

    await matchTracksToLibrary([external()], { musicFolderId: "folder-2" });

    expect(search3Mock).toHaveBeenCalledWith(
      "Cascade",
      expect.objectContaining({ musicFolderId: "folder-2" }),
    );
  });
});
