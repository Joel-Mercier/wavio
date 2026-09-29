// A sign-in as `joel` on a server where this device already holds `Joel`'s data
// must land in `Joel`'s storage scope: the scope is derived from the username as
// typed, and Navidrome / Jellyfin sign both spellings into the same account.
const mockMem = new Map<string, string>();

jest.mock("@/config/storage", () => ({
  storage: {
    getAllKeys: () => [...mockMem.keys()],
    getString: (key: string) => mockMem.get(key),
  },
}));

import {
  adoptCase,
  resolveSessionUsername,
  sessionUsernameFor,
} from "@/services/auth/sessionUsername";

const SERVER = "srv-1";
const scope = (username: string) => `srv_1_${username}`;

const resolve = (
  typed: string,
  weights: Record<string, number>,
  savedUsernames: string[] = [],
  serverType: "navidrome" | "jellyfin" | "opensubsonic" = "navidrome",
) =>
  resolveSessionUsername({
    serverId: SERVER,
    serverType,
    typed,
    savedUsernames,
    scopeWeights: new Map(Object.entries(weights)),
  });

describe("adoptCase", () => {
  it("copies letter case position by position", () => {
    expect(adoptCase("joel", "Joel")).toBe("Joel");
  });

  it("keeps characters the scope sanitized away", () => {
    expect(adoptCase("jo.el-M", "Jo_el_m")).toBe("Jo.el-m");
  });
});

describe("resolveSessionUsername", () => {
  it("adopts the spelling this server's data is stored under", () => {
    expect(resolve("joel", { [scope("Joel")]: 500 })).toBe("Joel");
  });

  it("prefers the spelling holding the most data when both exist", () => {
    expect(resolve("JOEL", { [scope("joel")]: 80, [scope("Joel")]: 500 })).toBe(
      "Joel",
    );
  });

  it("keeps the typed spelling on a tie", () => {
    expect(resolve("joel", { [scope("joel")]: 10, [scope("Joel")]: 10 })).toBe(
      "joel",
    );
  });

  it("ignores other servers' scopes", () => {
    expect(resolve("joel", { srv_2_Joel: 900 })).toBe("joel");
  });

  it("falls back to a saved user's spelling when there is no data yet", () => {
    expect(resolve("joel", {}, ["Joel", "bob"])).toBe("Joel");
  });

  it("leaves the typed name alone when nothing matches", () => {
    expect(resolve("alice", { [scope("Joel")]: 500 }, ["Joel"])).toBe("alice");
  });

  it("never folds case on a generic OpenSubsonic server", () => {
    expect(
      resolve("joel", { [scope("Joel")]: 500 }, ["Joel"], "opensubsonic"),
    ).toBe("joel");
  });

  it("works for Jellyfin too", () => {
    expect(resolve("joel", { [scope("Joel")]: 500 }, [], "jellyfin")).toBe(
      "Joel",
    );
  });
});

describe("sessionUsernameFor", () => {
  beforeEach(() => mockMem.clear());

  it("weighs scopes by their data in storage, not their query cache", () => {
    mockMem.set(`${scope("Joel")}:offlineStore`, "x".repeat(200));
    mockMem.set(`${scope("joel")}:wavio-rq:["artists"]`, "x".repeat(5000));
    mockMem.set(`${scope("joel")}:recentPlays`, "x".repeat(10));
    expect(
      sessionUsernameFor({ id: SERVER, type: "navidrome" }, "joel", []),
    ).toBe("Joel");
  });
});
