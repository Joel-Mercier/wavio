const mockGetColors = jest.fn();
jest.mock("react-native-image-colors", () => ({
  getColors: (...args: unknown[]) => mockGetColors(...args),
}));
jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({}),
}));

import { loadImageColors } from "@/hooks/useImageColors";

const colors = { platform: "android", muted: "#123456" };
const mockFetch = jest.fn();

beforeEach(() => {
  mockGetColors.mockReset();
  mockFetch.mockReset();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe("loadImageColors", () => {
  it("extracts straight from the url when that works", async () => {
    mockGetColors.mockResolvedValueOnce(colors);
    await expect(loadImageColors("http://feed.example/a.jpg")).resolves.toBe(
      colors,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("retries an http image at the https address it redirects to", async () => {
    mockGetColors
      .mockRejectedValueOnce(new Error("Failed to get image"))
      .mockResolvedValueOnce(colors);
    mockFetch.mockResolvedValueOnce({ url: "https://feed.example/a.jpg" });

    await expect(loadImageColors("http://feed.example/a.jpg")).resolves.toBe(
      colors,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "http://feed.example/a.jpg",
      expect.objectContaining({ method: "HEAD" }),
    );
    expect(mockGetColors).toHaveBeenLastCalledWith(
      "https://feed.example/a.jpg",
      expect.objectContaining({ key: "http://feed.example/a.jpg" }),
    );
  });

  it("doesn't probe an https image that fails", async () => {
    const error = new Error("Failed to get image");
    mockGetColors.mockRejectedValueOnce(error);
    await expect(loadImageColors("https://feed.example/a.jpg")).rejects.toBe(
      error,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("keeps the original error when nothing redirects", async () => {
    const error = new Error("Failed to get image");
    mockGetColors.mockRejectedValueOnce(error);
    mockFetch.mockResolvedValueOnce({ url: "http://feed.example/a.jpg" });
    await expect(loadImageColors("http://feed.example/a.jpg")).rejects.toBe(
      error,
    );
    expect(mockGetColors).toHaveBeenCalledTimes(1);
  });

  it("keeps the original error when the probe itself fails", async () => {
    const error = new Error("Failed to get image");
    mockGetColors.mockRejectedValueOnce(error);
    mockFetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    await expect(loadImageColors("http://feed.example/a.jpg")).rejects.toBe(
      error,
    );
  });
});
