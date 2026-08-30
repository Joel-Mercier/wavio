// GitHub throttles unauthenticated callers per *IP*, and carrier-grade NAT puts
// many users behind one. So the update check gets 403s that say nothing about a
// device, the app or the request — reporting them files an Issue nobody can act
// on, and retrying on the next launch spends more of the same quota.
const mockGet = jest.fn();
jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    !!(e as { isAxiosError?: boolean })?.isAxiosError;
  // Deref mockGet lazily: jest hoists this factory above the `const`, and
  // github.ts calls axios.create() at module scope, so capturing it eagerly
  // would bind `undefined`.
  const instance = { get: (...args: unknown[]) => mockGet(...args) };
  return {
    __esModule: true,
    default: { create: () => instance, isAxiosError },
    create: () => instance,
    isAxiosError,
  };
});

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.3.0" }));

import {
  fetchLatestRelease,
  isGithubRateLimited,
} from "@/services/appUpdate/github";

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });

beforeEach(() => {
  mockGet.mockReset();
  mockReportError.mockReset();
});

describe("the GitHub update check", () => {
  it.each([403, 429])("does not report a %i (over quota)", async (status) => {
    mockGet.mockRejectedValue(httpError(status));
    await expect(fetchLatestRelease()).rejects.toThrow();
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("still throws when rate limited, so the check reads as 'couldn't check'", async () => {
    mockGet.mockRejectedValue(httpError(403));
    // Not `null` — that means "up to date" and would stamp the throttle as a
    // successful check.
    await expect(fetchLatestRelease()).rejects.toThrow();
  });

  it("reports a failure that is genuinely ours to fix", async () => {
    mockGet.mockRejectedValue(httpError(500));
    await expect(fetchLatestRelease()).rejects.toThrow();
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError.mock.calls[0][1]).toMatchObject({
      api: "github",
      status: 500,
    });
  });

  it("resolves a 404 to 'no release' without reporting", async () => {
    mockGet.mockRejectedValue(httpError(404));
    await expect(fetchLatestRelease()).resolves.toBeNull();
    // Reported, but the classifier drops it on notFoundIsExpected.
    expect(mockReportError.mock.calls[0][1]).toMatchObject({
      notFoundIsExpected: true,
    });
  });
});

describe("isGithubRateLimited", () => {
  it("matches only the quota statuses", () => {
    expect(isGithubRateLimited(httpError(403))).toBe(true);
    expect(isGithubRateLimited(httpError(429))).toBe(true);
    expect(isGithubRateLimited(httpError(500))).toBe(false);
    expect(isGithubRateLimited(httpError(404))).toBe(false);
  });

  it("does not match a non-HTTP failure", () => {
    // An offline launch must keep the retry-next-time behaviour, not be
    // mistaken for a quota that needs waiting out.
    expect(isGithubRateLimited(new Error("Network Error"))).toBe(false);
  });
});
