// The clip upload is the one AudioMuse call with a multipart body, which breaks
// two assumptions the JSON calls get away with: axios serialises a FormData into
// JSON whenever the content type says so, and AudioMuse never reads the server
// selection from form fields — only from a JSON body or the query string.
const mockRequest = jest.fn();

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      create: () => ({
        request: (...args: unknown[]) => mockRequest(...args),
      }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

const mockReportError = jest.fn();
jest.mock("@/services/errorReporting", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));

jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  RECORDING_RESULTS,
  searchByRecording,
} from "@/services/audioMuse/recording";
import { useAudioMuseBase } from "@/stores/audioMuse";

// Node's FormData stringifies anything that isn't a Blob, so the file
// descriptor React Native's FormData takes would read back as "[object Object]".
class RecordingFormData {
  parts: Record<string, unknown> = {};
  append(name: string, value: unknown) {
    this.parts[name] = value;
  }
}
global.FormData = RecordingFormData as unknown as typeof FormData;

const lastRequest = () => mockRequest.mock.calls.at(-1)?.[0];

beforeEach(() => {
  mockRequest.mockReset();
  mockReportError.mockReset();
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("searchByRecording", () => {
  it("uploads the clip as multipart with an extension AudioMuse decodes", async () => {
    mockRequest.mockResolvedValue({ data: { results: [] } });

    await searchByRecording({ uri: "file:///cache/rec.m4a" });

    const { url, method, data, headers } = lastRequest();
    expect(url).toBe("/api/recording_search/search");
    expect(method).toBe("post");
    expect(data).toBeInstanceOf(FormData);
    expect(headers).toMatchObject({
      Authorization: "Bearer T",
      "Content-Type": "multipart/form-data",
    });
    expect((data as RecordingFormData).parts).toEqual({
      clip: {
        uri: "file:///cache/rec.m4a",
        name: "recording.m4a",
        type: "audio/mp4",
      },
      n_results: String(RECORDING_RESULTS),
    });
  });

  it("sends the server selection in the query, not the form", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");
    mockRequest.mockResolvedValue({ data: { results: [] } });

    await searchByRecording({ uri: "file:///cache/rec.m4a" });

    expect(lastRequest().params).toEqual({ server: "srv-2" });
    expect(lastRequest().data).toBeInstanceOf(FormData);
  });

  it("drops rows without an id, keeping the server's order", async () => {
    mockRequest.mockResolvedValue({
      data: {
        results: [
          { item_id: "a", identified: true },
          { item_id: "" },
          { item_id: "b" },
        ],
      },
    });

    const matches = await searchByRecording({ uri: "file:///cache/rec.m4a" });

    expect(matches.map((match) => match.item_id)).toEqual(["a", "b"]);
  });

  // A silent clip or an index that isn't loaded yet is something the user is
  // told about, not a bug to report.
  it("marks a rejected clip and an unready index as expected", async () => {
    mockRequest.mockRejectedValue(
      Object.assign(new Error("HTTP 400"), {
        isAxiosError: true,
        response: { status: 400, data: { error: "The clip is silent." } },
      }),
    );

    await expect(
      searchByRecording({ uri: "file:///cache/rec.m4a" }),
    ).rejects.toThrow("The clip is silent.");
    expect(mockReportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        badRequestIsExpected: true,
        serviceUnavailableIsExpected: true,
      }),
    );
  });
});
