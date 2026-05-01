jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    zustandStorage: {
      setItem: (k: string, v: string) => mem.set(k, v),
      getItem: (k: string) => mem.get(k) ?? null,
      removeItem: (k: string) => mem.delete(k),
    },
  };
});

const mockChangeLanguage = jest.fn();
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: {
    changeLanguage: (lng: string) => mockChangeLanguage(lng),
  },
}));

jest.mock("zod", () => {
  const actual = jest.requireActual("zod");
  return {
    ...actual,
    config: jest.fn(),
    locales: { en: () => ({}), fr: () => ({}) },
  };
});

import { useAppBase } from "@/stores/app";

const reset = () =>
  useAppBase.setState(
    {
      locale: null,
      showDrawer: false,
      showAddTab: false,
      librarySort: "addedAtAsc",
      favoritesSort: "addedAtAsc",
    },
    false,
  );

beforeEach(() => {
  reset();
  mockChangeLanguage.mockClear();
});

describe("app store", () => {
  it("setLocale updates locale and notifies i18n", () => {
    useAppBase.getState().setLocale("fr");
    expect(useAppBase.getState().locale).toBe("fr");
    expect(mockChangeLanguage).toHaveBeenCalledWith("fr");
  });

  it("setShowDrawer toggles flag", () => {
    useAppBase.getState().setShowDrawer(true);
    expect(useAppBase.getState().showDrawer).toBe(true);
    useAppBase.getState().setShowDrawer(false);
    expect(useAppBase.getState().showDrawer).toBe(false);
  });

  it("setShowAddTab toggles flag", () => {
    useAppBase.getState().setShowAddTab(true);
    expect(useAppBase.getState().showAddTab).toBe(true);
  });

  it("setLibrarySort and setFavoritesSort update independently", () => {
    useAppBase.getState().setLibrarySort("alphabeticalDesc");
    useAppBase.getState().setFavoritesSort("addedAtDesc");
    expect(useAppBase.getState().librarySort).toBe("alphabeticalDesc");
    expect(useAppBase.getState().favoritesSort).toBe("addedAtDesc");
  });

  it("default sort values are addedAtAsc", () => {
    expect(useAppBase.getState().librarySort).toBe("addedAtAsc");
    expect(useAppBase.getState().favoritesSort).toBe("addedAtAsc");
  });
});
