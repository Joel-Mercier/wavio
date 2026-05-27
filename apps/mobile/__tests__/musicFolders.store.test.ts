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
    getAuthScope: (url: string, username: string) => {
      const safeUrl = url.replace(/[^a-zA-Z0-9]/g, "_");
      const safeUsername = username.replace(/[^a-zA-Z0-9]/g, "_");
      return `${safeUrl}_${safeUsername}`;
    },
  };
});

const authState = { url: "", username: "" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: Object.assign(
    (selector: (s: { url: string; username: string }) => unknown) =>
      selector(authState),
    { getState: () => authState },
  ),
}));

import * as React from "react";
import TestRenderer from "react-test-renderer";
import {
  useCurrentAuthScope,
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

describe("useCurrentAuthScope / useCurrentMusicFolderId", () => {
  beforeEach(() => {
    authState.url = "";
    authState.username = "";
    useMusicFoldersBase.setState({ selections: {} });
  });

  test("useCurrentAuthScope returns undefined when url is missing", () => {
    authState.url = "";
    authState.username = "alice";
    expect(callHook(useCurrentAuthScope)).toBeUndefined();
  });

  test("useCurrentAuthScope returns undefined when username is missing", () => {
    authState.url = "https://x.example.com";
    authState.username = "";
    expect(callHook(useCurrentAuthScope)).toBeUndefined();
  });

  test("useCurrentAuthScope derives scope from url + username", () => {
    authState.url = "https://x.example.com";
    authState.username = "alice";
    expect(callHook(useCurrentAuthScope)).toBe("https___x_example_com_alice");
  });

  test("useCurrentMusicFolderId returns undefined when no scope", () => {
    authState.url = "";
    authState.username = "";
    useMusicFoldersBase.setState({ selections: { anything: "f1" } });
    expect(callHook(useCurrentMusicFolderId)).toBeUndefined();
  });

  test("useCurrentMusicFolderId reads selection for the active scope", () => {
    authState.url = "https://x.example.com";
    authState.username = "alice";
    const scope = "https___x_example_com_alice";
    useMusicFoldersBase.setState({ selections: { [scope]: "folder-9" } });
    expect(callHook(useCurrentMusicFolderId)).toBe("folder-9");
  });
});
