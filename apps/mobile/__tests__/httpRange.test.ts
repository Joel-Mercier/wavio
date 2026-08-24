import axios from "axios";
import { httpRangeReader } from "@/services/fileSource/httpRange";

// The ranged reader every network file source uses: WebDAV against the share,
// SMB against its loopback bridge. Its whole job is one `Range` request plus a
// fallback for the servers that ignore it.

jest.mock("axios", () => ({ get: jest.fn() }));

const mockGet = axios.get as unknown as jest.Mock;

const bytes = (...values: number[]) => new Uint8Array(values);

beforeEach(() => {
  mockGet.mockReset();
});

describe("httpRangeReader", () => {
  it("asks for an inclusive byte range", async () => {
    mockGet.mockResolvedValue({ status: 206, data: bytes(1, 2, 3).buffer });
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });

    await reader.read(10, 3);

    expect(mockGet).toHaveBeenCalledWith(
      "http://host/a.flac",
      expect.objectContaining({
        headers: expect.objectContaining({ Range: "bytes=10-12" }),
        responseType: "arraybuffer",
        timeout: 100,
      }),
    );
  });

  it("returns a 206 body untouched", async () => {
    mockGet.mockResolvedValue({ status: 206, data: bytes(7, 8).buffer });
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });

    expect(await reader.read(4, 2)).toEqual(bytes(7, 8));
  });

  // A server that ignores `Range` answers 200 with the whole file. Trimming it
  // here is what keeps the tag parser's offsets meaningful instead of it reading
  // the head of the file as if it were the requested window.
  it("slices a 200 that ignored the range", async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: bytes(0, 1, 2, 3, 4, 5).buffer,
    });
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });

    expect(await reader.read(2, 3)).toEqual(bytes(2, 3, 4));
  });

  it("short-circuits an empty read without a request", async () => {
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });

    expect(await reader.read(0, 0)).toEqual(new Uint8Array(0));
    expect(await reader.read(0, -5)).toEqual(new Uint8Array(0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  // Resolved per request, not captured: a scan outlives a credential change.
  it("re-resolves headers on every read", async () => {
    mockGet.mockResolvedValue({ status: 206, data: bytes(1).buffer });
    let token = "first";
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      headers: () => ({ Authorization: token }),
      timeoutMs: 100,
    });

    await reader.read(0, 1);
    token = "second";
    await reader.read(1, 1);

    expect(mockGet.mock.calls[0][1].headers.Authorization).toBe("first");
    expect(mockGet.mock.calls[1][1].headers.Authorization).toBe("second");
  });

  it("accepts only 200 and 206", async () => {
    mockGet.mockResolvedValue({ status: 206, data: bytes(1).buffer });
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });
    await reader.read(0, 1);

    const { validateStatus } = mockGet.mock.calls[0][1];
    expect(validateStatus(200)).toBe(true);
    expect(validateStatus(206)).toBe(true);
    expect(validateStatus(416)).toBe(false);
    expect(validateStatus(404)).toBe(false);
  });

  it("is stateless, so close costs nothing", () => {
    const reader = httpRangeReader({
      url: "http://host/a.flac",
      timeoutMs: 100,
    });
    expect(() => reader.close()).not.toThrow();
  });
});
