// Nothing else reads a Jellyfin server's version during normal use, so the
// reachability probe has to record it, or version-gated behaviour (the 12.0+
// search fallback skip, issue #272) never sees anything but "unknown".
const mockGet = jest.fn();
const mockSetServerVersion = jest.fn();
let mockState: {
  serverType: string;
  jellyfinAccessToken: string | null;
  serverVersion: string | null;
};

jest.mock("axios", () => ({
  __esModule: true,
  default: { create: () => ({ get: mockGet, request: jest.fn() }) },
}));
jest.mock("@/modules/smb", () => ({ smbProbe: jest.fn() }));
jest.mock("@/services/backgroundTimer", () => ({
  setBackgroundTimeout: () => 1,
  clearBackgroundTimer: jest.fn(),
}));
jest.mock("@/services/jellyfin/index", () => ({
  buildAuthorizationHeader: (token: string | null) => `MediaBrowser ${token}`,
}));
jest.mock("@/services/network", () => ({ USER_AGENT: "wavio" }));
jest.mock("@/services/oidc/session", () => ({
  ensureFreshAccessToken: jest.fn(async () => {}),
  recoverFromUnauthorized: jest.fn(async () => false),
}));
jest.mock("@/services/openSubsonic/auth", () => ({
  subsonicAuthParams: () => ({}),
}));
jest.mock("@/services/serverHeaders", () => ({
  customHeadersForUrl: () => ({}),
  requestHeadersForUrl: () => ({}),
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: {
    getState: () => ({ ...mockState, setServerVersion: mockSetServerVersion }),
  },
}));

import { probeUrl } from "@/services/backend/probe";

beforeEach(() => {
  mockGet.mockReset();
  mockSetServerVersion.mockReset();
  mockState = {
    serverType: "jellyfin",
    jellyfinAccessToken: "token-a",
    serverVersion: null,
  };
});

describe("Jellyfin probe", () => {
  it("records the server version", async () => {
    mockGet.mockResolvedValue({ status: 200, data: { Version: "12.4.0" } });
    await expect(probeUrl("http://jf")).resolves.toBe(true);
    expect(mockSetServerVersion).toHaveBeenCalledWith("12.4.0");
  });

  it("leaves an unchanged version alone", async () => {
    mockState.serverVersion = "12.4.0";
    mockGet.mockResolvedValue({ status: 200, data: { Version: "12.4.0" } });
    await probeUrl("http://jf");
    expect(mockSetServerVersion).not.toHaveBeenCalled();
  });

  it("drops the version when the session changed mid-probe", async () => {
    mockGet.mockImplementation(async () => {
      mockState.jellyfinAccessToken = "token-b";
      return { status: 200, data: { Version: "10.11.11" } };
    });
    await probeUrl("http://jf");
    expect(mockSetServerVersion).not.toHaveBeenCalled();
  });

  it("fails without a version, and records nothing", async () => {
    mockGet.mockResolvedValue({ status: 200, data: {} });
    await expect(probeUrl("http://jf")).resolves.toBe(false);
    expect(mockSetServerVersion).not.toHaveBeenCalled();
  });
});
