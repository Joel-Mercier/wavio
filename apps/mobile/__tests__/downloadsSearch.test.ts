jest.mock("@/services/searchIndex", () => {
  const actual = jest.requireActual("@/services/searchIndex");
  return {
    ...actual,
    createSearchIndex: jest.fn(actual.createSearchIndex),
  };
});

import * as React from "react";
import TestRenderer from "react-test-renderer";
import { useDownloadsSearch } from "@/hooks/offline/useDownloadsSearch";
import { createSearchIndex } from "@/services/searchIndex";
import type { OfflineTrack } from "@/stores/offline";
import type { OfflineTrackSortType } from "@/utils/trackSort";

// A fuzzy search over every download blocks the JS thread for seconds on a
// 20k-track library, so the Offline downloads screen must never rebuild the
// index per keystroke, must not build it just to open, and must get a chance
// to render skeletons before each search runs.

const track = (id: string, title: string): OfflineTrack => ({
  id,
  title,
  duration: 1,
  path: `/doc/${id}.mp3`,
  size: 1,
  downloadedAt: "2026-01-01T00:00:00.000Z",
});

const tracks = [
  track("1", "Tide Signal 49792"),
  track("2", "Amber 49791"),
  track("3", "Ash 49793"),
  track("4", "Nova 12345"),
];

type Props = {
  tracks: OfflineTrack[];
  sort: OfflineTrackSortType;
  query: string;
};

type Result = ReturnType<typeof useDownloadsSearch>;

function render(initial: Props) {
  let result!: Result;
  const Probe = (props: Props) => {
    result = useDownloadsSearch(props.tracks, props.sort, props.query);
    return null;
  };
  let root!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(Probe, initial));
  });
  return {
    result: () => result,
    titles: () => result.data.map((t) => t.title),
    update: (props: Props) =>
      TestRenderer.act(() => root.update(React.createElement(Probe, props))),
    unmount: () => TestRenderer.act(() => root.unmount()),
  };
}

const settle = () => TestRenderer.act(() => jest.runOnlyPendingTimers());

const createSearchIndexMock = createSearchIndex as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  createSearchIndexMock.mockClear();
});

afterEach(() => jest.useRealTimers());

test("opening the screen doesn't build the index", () => {
  const view = render({ tracks, sort: "alphabeticalAsc", query: "" });
  settle();
  view.update({ tracks, sort: "alphabeticalDesc", query: "" });
  settle();
  expect(createSearchIndexMock).not.toHaveBeenCalled();
  view.unmount();
});

test("builds the index once per list, not per query or sort", () => {
  const view = render({ tracks, sort: "alphabeticalAsc", query: "" });
  for (const query of ["4", "49", "49792"]) {
    view.update({ tracks, sort: "alphabeticalAsc", query });
    settle();
  }
  view.update({ tracks, sort: "alphabeticalDesc", query: "49792" });
  settle();
  view.update({ tracks, sort: "alphabeticalDesc", query: "" });
  settle();
  view.update({ tracks, sort: "alphabeticalDesc", query: "4" });
  settle();
  expect(createSearchIndexMock).toHaveBeenCalledTimes(1);

  view.update({
    tracks: [...tracks, track("5", "Echo 1")],
    sort: "alphabeticalDesc",
    query: "4",
  });
  settle();
  expect(createSearchIndexMock).toHaveBeenCalledTimes(2);
  view.unmount();
});

test("reports searching until the deferred search has run", () => {
  const view = render({ tracks, sort: "alphabeticalAsc", query: "" });
  view.update({ tracks, sort: "alphabeticalAsc", query: "49792" });
  expect(view.result()).toEqual({ data: [], isSearching: true });
  expect(createSearchIndexMock).not.toHaveBeenCalled();

  settle();
  expect(view.result().isSearching).toBe(false);
  expect(view.titles()[0]).toBe("Tide Signal 49792");

  view.update({
    tracks: tracks.slice(1),
    sort: "alphabeticalAsc",
    query: "49792",
  });
  expect(view.result().isSearching).toBe(true);
  settle();
  expect(view.titles()).not.toContain("Tide Signal 49792");
  view.unmount();
});

test("clearing the query shows every download at once", () => {
  const view = render({ tracks, sort: "alphabeticalAsc", query: "" });
  view.update({ tracks, sort: "alphabeticalAsc", query: "49792" });
  settle();
  view.update({ tracks, sort: "alphabeticalAsc", query: "" });
  expect(view.result().isSearching).toBe(false);
  expect(view.titles()).toEqual([
    "Amber 49791",
    "Ash 49793",
    "Nova 12345",
    "Tide Signal 49792",
  ]);
  view.unmount();
});

test("puts the exact match first and breaks score ties by the sort", () => {
  const view = render({ tracks, sort: "alphabeticalAsc", query: "49792" });
  settle();
  expect(view.titles()).toEqual([
    "Tide Signal 49792",
    "Amber 49791",
    "Ash 49793",
  ]);

  view.update({ tracks, sort: "alphabeticalDesc", query: "49792" });
  expect(view.titles()).toEqual([
    "Tide Signal 49792",
    "Ash 49793",
    "Amber 49791",
  ]);
  view.unmount();
});
