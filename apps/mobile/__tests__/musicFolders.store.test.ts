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
  useCurrentMusicFolderId,
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

  test("setCurrentFolder stores the id under the given scope", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    expect(get().selections).toEqual({ scopeA: "folder-1" });
  });

  test("setCurrentFolder overwrites previous id for the same scope", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    get().setCurrentFolder("scopeA", "folder-2");
    expect(get().selections).toEqual({ scopeA: "folder-2" });
  });

  test("setCurrentFolder keeps selections for other scopes intact", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    get().setCurrentFolder("scopeB", "folder-2");
    expect(get().selections).toEqual({
      scopeA: "folder-1",
      scopeB: "folder-2",
    });
  });

  test("setCurrentFolder accepts undefined to clear a single scope value", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    get().setCurrentFolder("scopeA", undefined);
    expect(get().selections).toEqual({ scopeA: undefined });
  });

  test("clearScope removes the entry for the given scope only", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    get().setCurrentFolder("scopeB", "folder-2");
    get().clearScope("scopeA");
    expect(get().selections).toEqual({ scopeB: "folder-2" });
    expect(Object.hasOwn(get().selections, "scopeA")).toBe(false);
  });

  test("clearScope is a no-op when the scope has no entry", () => {
    get().setCurrentFolder("scopeA", "folder-1");
    get().clearScope("scopeB");
    expect(get().selections).toEqual({ scopeA: "folder-1" });
  });
});

describe("useCurrentMusicFolderId", () => {
  beforeEach(() => {
    mockAuthState.scope = undefined;
    useMusicFoldersBase.setState({ selections: {} });
  });

  test("useCurrentMusicFolderId returns undefined when no scope", () => {
    mockAuthState.scope = undefined;
    useMusicFoldersBase.setState({ selections: { anything: "f1" } });
    expect(callHook(useCurrentMusicFolderId)).toBeUndefined();
  });

  test("useCurrentMusicFolderId reads selection for the active scope", () => {
    mockAuthState.scope = "srv_1_alice";
    useMusicFoldersBase.setState({ selections: { srv_1_alice: "folder-9" } });
    expect(callHook(useCurrentMusicFolderId)).toBe("folder-9");
  });
});
