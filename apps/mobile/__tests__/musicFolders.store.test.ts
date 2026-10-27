jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    zustandStorage: {
      setItem: (name: string, value: string) => {
        mem.set(name, value);
      },
      getItem: (name: string) => mem.get(name) ?? null,
      removeItem: (name: string) => {
        mem.delete(name);
      },
    },
  };
});

// The scope itself is stores/auth's concern (and is covered there); this suite
// only needs it to vary, so the hook is stubbed rather than reimplemented.
const mockAuthState: { scope: string | undefined } = { scope: undefined };
jest.mock("@/stores/auth", () => ({
  useCurrentAuthScope: () => mockAuthState.scope,
}));

import * as React from "react";
import TestRenderer from "react-test-renderer";
import {
  normalizeMusicFolderSelection,
  useCurrentMusicFolderIds,
  useMusicFoldersBase,
} from "@/stores/musicFolders";

const get = () => useMusicFoldersBase.getState();

const callHook = <T>(hook: () => T): T => {
  let value!: T;
  const Probe = () => {
    value = hook();
    return null;
  };
  let root!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(Probe));
  });
  TestRenderer.act(() => {
    root.unmount();
  });
  return value;
};

beforeEach(() => {
  useMusicFoldersBase.setState({ selections: {} });
});

describe("musicFolders store", () => {
  test("initial state has empty selections", () => {
    expect(get().selections).toEqual({});
  });

  test("setCurrentFolders stores the ids under the given scope", () => {
    get().setCurrentFolders("scopeA", ["folder-1", "folder-2"]);
    expect(get().selections).toEqual({ scopeA: ["folder-1", "folder-2"] });
  });

  test("setCurrentFolders overwrites previous ids for the same scope", () => {
    get().setCurrentFolders("scopeA", ["folder-1"]);
    get().setCurrentFolders("scopeA", ["folder-2"]);
    expect(get().selections).toEqual({ scopeA: ["folder-2"] });
  });

  test("setCurrentFolders keeps selections for other scopes intact", () => {
    get().setCurrentFolders("scopeA", ["folder-1"]);
    get().setCurrentFolders("scopeB", ["folder-2"]);
    expect(get().selections).toEqual({
      scopeA: ["folder-1"],
      scopeB: ["folder-2"],
    });
  });

  test("setCurrentFolders stores an empty list as 'all libraries'", () => {
    get().setCurrentFolders("scopeA", ["folder-1"]);
    get().setCurrentFolders("scopeA", []);
    expect(get().selections).toEqual({ scopeA: undefined });
  });

  test("setCurrentFolders drops duplicate ids", () => {
    get().setCurrentFolders("scopeA", ["folder-1", "folder-1"]);
    expect(get().selections).toEqual({ scopeA: ["folder-1"] });
  });

  test("clearScope removes the entry for the given scope only", () => {
    get().setCurrentFolders("scopeA", ["folder-1"]);
    get().setCurrentFolders("scopeB", ["folder-2"]);
    get().clearScope("scopeA");
    expect(get().selections).toEqual({ scopeB: ["folder-2"] });
    expect(Object.hasOwn(get().selections, "scopeA")).toBe(false);
  });

  test("clearScope is a no-op when the scope has no entry", () => {
    get().setCurrentFolders("scopeA", ["folder-1"]);
    get().clearScope("scopeB");
    expect(get().selections).toEqual({ scopeA: ["folder-1"] });
  });
});

describe("normalizeMusicFolderSelection", () => {
  test("lifts a legacy single id into a list", () => {
    expect(normalizeMusicFolderSelection("folder-1")).toEqual(["folder-1"]);
  });

  test("reads anything else as 'all libraries'", () => {
    expect(normalizeMusicFolderSelection(undefined)).toBeUndefined();
    expect(normalizeMusicFolderSelection(null)).toBeUndefined();
    expect(normalizeMusicFolderSelection([])).toBeUndefined();
  });
});

describe("persist migration", () => {
  test("rewrites v0 single-id selections as lists", async () => {
    const { migrate } = useMusicFoldersBase.persist.getOptions();
    const migrated = await migrate?.(
      { selections: { scopeA: "folder-1", scopeB: undefined } },
      0,
    );
    expect(migrated).toEqual({
      selections: { scopeA: ["folder-1"], scopeB: undefined },
    });
  });
});

describe("useCurrentMusicFolderIds", () => {
  beforeEach(() => {
    mockAuthState.scope = undefined;
    useMusicFoldersBase.setState({ selections: {} });
  });

  test("returns undefined when no scope", () => {
    mockAuthState.scope = undefined;
    useMusicFoldersBase.setState({ selections: { anything: ["f1"] } });
    expect(callHook(useCurrentMusicFolderIds)).toBeUndefined();
  });

  test("reads the selection for the active scope", () => {
    mockAuthState.scope = "srv_1_alice";
    useMusicFoldersBase.setState({
      selections: { srv_1_alice: ["folder-9", "folder-3"] },
    });
    expect(callHook(useCurrentMusicFolderIds)).toEqual([
      "folder-9",
      "folder-3",
    ]);
  });
});
