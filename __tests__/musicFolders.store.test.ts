import { useMusicFoldersBase } from "@/stores/musicFolders";

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

jest.mock("@/stores/auth", () => ({
  useAuthBase: Object.assign(
    (selector: (s: { url: string; username: string }) => unknown) =>
      selector({ url: "", username: "" }),
    { getState: () => ({ url: "", username: "" }) },
  ),
}));

const get = () => useMusicFoldersBase.getState();

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
