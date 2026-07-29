// The chat pipeline is the one AudioMuse call that streams, so it can't go
// through the shared axios instance. What matters here is that a frame split
// across chunk boundaries still parses, that an in-band `error` event is not
// retried (the fallback would just re-run the same failing pipeline), and that
// a transport-level failure *does* fall back to the non-streaming endpoint.
const mockStreamingFetch = jest.fn();
const mockRequest = jest.fn();

jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockStreamingFetch(...args),
}));

jest.mock("axios", () => {
  const isAxiosError = (e: unknown) =>
    Boolean((e as { isAxiosError?: boolean })?.isAxiosError);
  return {
    __esModule: true,
    default: {
      create: () => ({ request: (...args: unknown[]) => mockRequest(...args) }),
      isCancel: () => false,
      isAxiosError,
    },
    isCancel: () => false,
    isAxiosError,
  };
});

jest.mock("@/services/errorReporting", () => ({ reportError: jest.fn() }));

jest.mock("@/config/storage", () => ({
  createDynamicScopedStorage: () => ({
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  }),
}));

jest.mock("@/stores/auth", () => ({ currentAuthScope: () => "scope" }));

import {
  AudioMuseChatError,
  generateChatPlaylist,
} from "@/services/audioMuse/chat";
import { useAudioMuseBase } from "@/stores/audioMuse";

// A body that hands out exactly the chunks given, so a test can split an SSE
// frame anywhere it likes.
function bodyOf(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < chunks.length
          ? { done: false, value: encoder.encode(chunks[i++]) }
          : { done: true, value: undefined },
      cancel: async () => {},
    }),
  };
}

const streamResponse = (chunks: string[]) => ({
  ok: true,
  status: 200,
  body: bodyOf(chunks),
});

const doneFrame = (ids: string[]) =>
  `data: ${JSON.stringify({
    type: "done",
    response: { query_results: ids.map((item_id) => ({ item_id })) },
  })}\n\n`;

beforeEach(() => {
  mockStreamingFetch.mockReset();
  mockRequest.mockReset();
  useAudioMuseBase.getState().__reset();
  useAudioMuseBase
    .getState()
    .setConfig({ serverUrl: "http://muse.local", apiToken: "T" });
});

describe("generateChatPlaylist", () => {
  it("reports each log line and returns the done payload", async () => {
    mockStreamingFetch.mockResolvedValue(
      streamResponse([
        ": stream-open\n\n",
        'data: {"type":"log","line":"analysing"}\n\n',
        'data: {"type":"log","line":"searching"}\n\n',
        doneFrame(["a", "b"]),
      ]),
    );
    const logs: string[] = [];

    const response = await generateChatPlaylist("rainy afternoon", {
      onLog: (line) => logs.push(line),
    });

    expect(logs).toEqual(["analysing", "searching"]);
    expect(response.query_results?.map((r) => r.item_id)).toEqual(["a", "b"]);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("parses a frame split across chunk boundaries", async () => {
    // The network decides where chunks break, not the server.
    const frame = doneFrame(["a"]);
    mockStreamingFetch.mockResolvedValue(
      streamResponse([frame.slice(0, 12), frame.slice(12)]),
    );

    const response = await generateChatPlaylist("x");

    expect(response.query_results?.map((r) => r.item_id)).toEqual(["a"]);
  });

  it("sends the bearer token and the server selection", async () => {
    useAudioMuseBase.getState().setServerId("srv-2");
    mockStreamingFetch.mockResolvedValue(streamResponse([doneFrame([])]));

    await generateChatPlaylist("x");

    const [, init] = mockStreamingFetch.mock.calls[0];
    expect(init.headers).toMatchObject({ Authorization: "Bearer T" });
    expect(JSON.parse(init.body)).toEqual({ userInput: "x", server: "srv-2" });
  });

  // AudioMuse only *defaults* ai_provider to its own AI_MODEL_PROVIDER, so a
  // deployment holding Gemini credentials with no default still needs to be told
  // which provider to run. Naming it is what makes that instance generate.
  it("names the provider the user picked", async () => {
    useAudioMuseBase.getState().setAiProviderOverride("GEMINI");
    mockStreamingFetch.mockResolvedValue(streamResponse([doneFrame([])]));

    await generateChatPlaylist("x");

    const [, init] = mockStreamingFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      userInput: "x",
      ai_provider: "GEMINI",
    });
  });

  it("falls back to the deployment's default provider", async () => {
    useAudioMuseBase.getState().setFeatures({ aiProvider: "OLLAMA" });
    mockStreamingFetch.mockResolvedValue(streamResponse([doneFrame([])]));

    await generateChatPlaylist("x");

    expect(JSON.parse(mockStreamingFetch.mock.calls[0][1].body)).toMatchObject({
      ai_provider: "OLLAMA",
    });
  });

  it("omits the provider when neither a pick nor a default exists", async () => {
    useAudioMuseBase.getState().setFeatures({ aiProvider: "NONE" });
    mockStreamingFetch.mockResolvedValue(streamResponse([doneFrame([])]));

    await generateChatPlaylist("x");

    expect(
      JSON.parse(mockStreamingFetch.mock.calls[0][1].body),
    ).not.toHaveProperty("ai_provider");
  });

  // A refusal arrives as a 200 with a null query_results; treating it as an
  // empty playlist would tell the user "nothing matched" for what is really a
  // misconfigured server.
  it("raises the server's message when nothing was generated", async () => {
    mockStreamingFetch.mockResolvedValue(
      streamResponse([
        `data: ${JSON.stringify({
          type: "done",
          response: {
            message: "No AI provider selected.",
            query_results: null,
          },
        })}\n\n`,
      ]),
    );

    await expect(generateChatPlaylist("x")).rejects.toThrow(
      "No AI provider selected.",
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("does not retry a pipeline that reported its own failure", async () => {
    mockStreamingFetch.mockResolvedValue(
      streamResponse(['data: {"type":"error","error":"boom"}\n\n']),
    );

    await expect(generateChatPlaylist("x")).rejects.toBeInstanceOf(
      AudioMuseChatError,
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("falls back to the non-streaming endpoint when streaming fails", async () => {
    // A reverse proxy that buffers or refuses text/event-stream.
    mockStreamingFetch.mockResolvedValue({
      ok: false,
      status: 502,
      body: null,
    });
    mockRequest.mockResolvedValue({
      data: { response: { query_results: [{ item_id: "z" }] } },
    });

    const response = await generateChatPlaylist("x");

    expect(response.query_results?.map((r) => r.item_id)).toEqual(["z"]);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/chat/api/chatPlaylist" }),
    );
  });

  it("does not fall back after the user cancelled", async () => {
    const controller = new AbortController();
    mockStreamingFetch.mockImplementation(async () => {
      controller.abort();
      throw new Error("Aborted");
    });

    await expect(
      generateChatPlaylist("x", { signal: controller.signal }),
    ).rejects.toThrow();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
