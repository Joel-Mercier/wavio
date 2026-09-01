// A Subsonic server reports an unimplemented method two ways: an HTTP 501, or
// HTTP 200 carrying envelope code 0 "Method not supported". Only the first
// reaches the axios error interceptor, so the second has to record the
// capability downgrade from subsonicEnvelope — otherwise a server that lacks
// getRandomSongs/getSongsByGenre shows two permanent error cards on Home.
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

// The real UNSUPPORTED_METHOD_RE, not a copy: it is shared with
// errorReporting's own matcher precisely so the two can't drift, and a mocked
// copy here would hide exactly the drift the sharing exists to prevent.
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

import type { AxiosResponse } from "axios";
import { subsonicEnvelope } from "@/services/openSubsonic";
import {
  activeOverrides,
  useCapabilityOverridesBase,
} from "@/stores/capabilityOverrides";

const failed = (url: string, code: number, message: string) =>
  ({
    data: {
      "subsonic-response": { status: "failed", error: { code, message } },
    },
    config: { url },
  }) as unknown as AxiosResponse<never>;

const songLists = () =>
  activeOverrides(useCapabilityOverridesBase.getState().disabledAt).songLists;

describe("subsonicEnvelope capability downgrade", () => {
  beforeEach(() => {
    useCapabilityOverridesBase.getState().__reset();
  });

  it("disables the capability on a code-0 'Method not supported' envelope", () => {
    expect(() =>
      subsonicEnvelope(
        failed(
          "/rest/getRandomSongs",
          0,
          "Method not supported: getRandomSongs",
        ),
      ),
    ).toThrow();
    expect(songLists()).toBe(false);
  });

  // Only Navidrome says "Method not supported". A server phrasing it its own way
  // used to leave the capability enabled forever — and file an Issue on every
  // screen visit that re-called the missing endpoint (Sentry WAVIO-GN et al.).
  it.each([
    "Unsupported request: getRandomSongs",
    "getRandomSongs is not implemented",
  ])("disables the capability on '%s' too", (message) => {
    expect(() =>
      subsonicEnvelope(failed("/rest/getRandomSongs", 0, message)),
    ).toThrow();
    expect(songLists()).toBe(false);
  });

  it("maps every dynamic endpoint, not just the song lists", () => {
    expect(() =>
      subsonicEnvelope(
        failed("/rest/createShare", 0, "Method not supported: createShare"),
      ),
    ).toThrow();
    expect(
      activeOverrides(useCapabilityOverridesBase.getState().disabledAt).sharing,
    ).toBe(false);
  });

  // A reverse proxy answering with an HTML error page yields code -1; a stale
  // id yields code 70. Neither means the endpoint is missing, so neither may
  // hide the feature.
  it.each([
    [-1, "Invalid or empty response from server"],
    [70, "The requested data was not found"],
  ])("leaves the capability alone on code %i", (code, message) => {
    expect(() =>
      subsonicEnvelope(failed("/rest/getRandomSongs", code, message)),
    ).toThrow();
    expect(songLists()).toBeUndefined();
  });

  it("ignores an unmapped endpoint", () => {
    expect(() =>
      subsonicEnvelope(
        failed("/rest/getAlbumList2", 0, "Method not supported: getAlbumList2"),
      ),
    ).toThrow();
    expect(
      activeOverrides(useCapabilityOverridesBase.getState().disabledAt),
    ).toEqual({});
  });
});
