import {
  collectionDownloadStatus,
  collectionDrift,
  collectionRemovalIds,
} from "@/services/offline/collectionDownloadPlan";
import type { DownloadProgress, OfflineTrack } from "@/stores/offline";

const downloaded = (...ids: string[]): Record<string, OfflineTrack> =>
  Object.fromEntries(
    ids.map((id) => [id, { id, path: `/tmp/${id}` } as OfflineTrack]),
  );

const inFlight = (
  ...entries: [string, DownloadProgress["status"]][]
): Record<string, DownloadProgress> =>
  Object.fromEntries(
    entries.map(([id, status]) => [id, { trackId: id, status, progress: 0 }]),
  ) as Record<string, DownloadProgress>;

describe("collectionDownloadStatus", () => {
  it("reports all when every tracked track is on disk", () => {
    expect(
      collectionDownloadStatus(["a", "b"], downloaded("a", "b"), {}),
    ).toEqual({ total: 2, downloadedCount: 2, status: "all" });
  });

  it("reports downloading while any tracked track is queued or in flight", () => {
    expect(
      collectionDownloadStatus(
        ["a", "b"],
        downloaded("a"),
        inFlight(["b", "pending"]),
      ).status,
    ).toBe("downloading");
  });

  it("reports partial once nothing is in flight", () => {
    expect(collectionDownloadStatus(["a", "b"], downloaded("a"), {})).toEqual({
      total: 2,
      downloadedCount: 1,
      status: "partial",
    });
  });

  it("reports none for an empty collection rather than all", () => {
    expect(collectionDownloadStatus([], downloaded("a"), {}).status).toBe(
      "none",
    );
  });

  // The point of the snapshot: a smart playlist re-drawn server-side must not
  // drag the badge off "all" just because the live list moved. The tracked list
  // handed in is the saved one, so tracks the server no longer serves still
  // count and ones it just added don't.
  it("measures the tracked list, not whatever else is downloaded", () => {
    expect(
      collectionDownloadStatus(["a", "b"], downloaded("a", "b", "c", "d"), {}),
    ).toEqual({ total: 2, downloadedCount: 2, status: "all" });
  });
});

describe("collectionDrift", () => {
  it("splits the difference between the saved and live lists", () => {
    expect(collectionDrift(["a", "b", "c"], ["b", "c", "d"])).toEqual({
      added: ["d"],
      removed: ["a"],
    });
  });

  it("reports nothing when the lists agree, whatever their order", () => {
    expect(collectionDrift(["a", "b"], ["b", "a"])).toEqual({
      added: [],
      removed: [],
    });
  });

  // A paused/loading query is not a server-side deletion. Reporting drift here
  // would offer to delete the entire collection while offline.
  it("reports nothing when there is no live list to compare against", () => {
    expect(collectionDrift(["a", "b"], undefined)).toEqual({
      added: [],
      removed: [],
    });
  });

  it("treats an unregistered collection as having nothing to drift from", () => {
    expect(collectionDrift(undefined, ["a"])).toEqual({
      added: [],
      removed: [],
    });
  });

  it("reports every saved track as removed when the server empties the list", () => {
    expect(collectionDrift(["a", "b"], []).removed).toEqual(["a", "b"]);
  });
});

describe("collectionRemovalIds", () => {
  // The leak this exists to close: removing downloads used to pass only the
  // live list, so every earlier draw of a random smart playlist stayed on disk
  // with nothing referencing it.
  it("unions the saved and live lists so drifted-away tracks still go", () => {
    expect(collectionRemovalIds(["a", "b"], ["b", "c"]).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("de-duplicates the overlap", () => {
    expect(collectionRemovalIds(["a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("falls back to whichever list it has", () => {
    expect(collectionRemovalIds(undefined, ["a"])).toEqual(["a"]);
    expect(collectionRemovalIds(["a"], undefined)).toEqual(["a"]);
    expect(collectionRemovalIds(undefined, undefined)).toEqual([]);
  });
});
