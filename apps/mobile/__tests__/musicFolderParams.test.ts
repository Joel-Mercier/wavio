// Navidrome reads a multi-library selection as the folder key repeated
// (`musicFolderId=1&musicFolderId=2`, and `library_id=` on its native API).
// axios' default serializer writes `musicFolderId[]=1` instead, which Navidrome
// doesn't recognise, so the selection would silently widen to every library.
jest.mock("@/config/storage", () => {
  const mem = new Map<string, string>();
  const make = () => ({
    setItem: (k: string, v: string) => mem.set(k, v),
    getItem: (k: string) => mem.get(k) ?? null,
    removeItem: (k: string) => mem.delete(k),
  });
  return {
    storage: {
      set: (k: string, v: string) => mem.set(k, v),
      getString: (k: string) => mem.get(k) ?? null,
      remove: (k: string) => mem.delete(k),
    },
    createDynamicScopedStorage: () => make(),
    getAuthScope: () => "scope",
  };
});
jest.mock("@/config/i18n", () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ url: "http://server", username: "joel" }),
  },
  currentAuthScope: () => "scope",
}));
jest.mock("@/services/errorReporting", () => ({
  ...jest.requireActual("@/services/errorReporting"),
  reportError: jest.fn(),
}));
jest.mock("@/services/navidromeIdMigration/detect", () => ({
  noteServerVersion: jest.fn(),
}));
jest.mock("@/services/network", () => ({ USER_AGENT: "wavio" }));
jest.mock("@/services/openSubsonic/auth", () => ({
  encodePasswordParam: (p: string) => p,
}));
jest.mock("@/services/serverHeaders", () => ({
  customHeadersForUrl: () => ({}),
}));
jest.mock("@/services/navidrome/auth", () => ({
  reauthenticateNavidrome: jest.fn(),
}));
jest.mock("@/services/oidc/session", () => ({}));

import type { AxiosRequestConfig } from "axios";
import navidromeApiInstance from "@/services/navidrome";
import openSubsonicApiInstance, {
  folderScopedRequest,
} from "@/services/openSubsonic";

const okResponse = {
  data: { "subsonic-response": { status: "ok", version: "1.16.1" } },
};

const subsonicUri = async (params: Record<string, unknown>) => {
  const get = jest
    .spyOn(openSubsonicApiInstance, "get")
    .mockResolvedValue(okResponse);
  await folderScopedRequest("/rest/search3", params, {});
  const [url, config] = get.mock.calls[0] as [string, AxiosRequestConfig];
  get.mockRestore();
  return openSubsonicApiInstance.getUri({ ...config, url, baseURL: "" });
};

describe("folderScopedRequest", () => {
  it("repeats musicFolderId once per selected library", async () => {
    const uri = await subsonicUri({ query: "a", musicFolderIds: ["1", "3"] });
    expect(uri).toContain("musicFolderId=1&musicFolderId=3");
    expect(uri).not.toContain("musicFolderIds");
    expect(uri).not.toContain("%5B%5D");
  });

  it("sends a single library as a plain musicFolderId", async () => {
    const uri = await subsonicUri({ query: "a", musicFolderIds: ["2"] });
    expect(uri).toContain("musicFolderId=2");
  });

  it("leaves musicFolderId out for 'all libraries'", async () => {
    const uri = await subsonicUri({ query: "a", musicFolderIds: undefined });
    expect(uri).not.toContain("musicFolderId");
  });
});

describe("navidrome native API", () => {
  it("repeats library_id once per selected library", () => {
    const uri = navidromeApiInstance.getUri({
      url: "/album",
      params: { library_id: ["1", "3"] },
    });
    expect(uri).toContain("library_id=1&library_id=3");
  });
});
