import { fetch as streamingFetch } from "expo/fetch";
import {
  AudioMuseNotConfiguredError,
  audioMuseRequest,
} from "@/services/audioMuse";
import type {
  AudioMuseChatEvent,
  AudioMuseChatResponse,
} from "@/services/audioMuse/types";
import { reportError } from "@/services/errorReporting";
import { getAiProvider, useAudioMuseBase } from "@/stores/audioMuse";

// The pipeline runs an LLM, several tool calls and a re-rank, so it routinely
// takes far longer than the instance's 15s reachability budget.
const CHAT_TIMEOUT_MS = 180_000;

export type ChatPlaylistOptions = {
  /** Called for every progress line the pipeline emits. */
  onLog?: (line: string) => void;
  signal?: AbortSignal;
};

// Streams `POST /chat/api/chatPlaylistStream`: one SSE `log` event per pipeline
// step, then a final `done` carrying the same payload the non-streaming endpoint
// returns. Uses expo/fetch rather than the shared axios instance because axios
// buffers the whole body in React Native — which would throw away the only
// reason to call the streaming variant. Any failure before the first event falls
// back to the plain endpoint, so a proxy that refuses to stream still works.
export async function generateChatPlaylist(
  userInput: string,
  { onLog, signal }: ChatPlaylistOptions = {},
): Promise<AudioMuseChatResponse> {
  try {
    return assertGenerated(
      await streamChatPlaylist(userInput, { onLog, signal }),
    );
  } catch (error) {
    if (error instanceof AudioMuseChatError) throw error;
    if (signal?.aborted) throw error;
    return assertGenerated(await requestChatPlaylist(userInput, signal));
  }
}

// A refusal is a 200 here: no provider, no credentials for the one asked for, a
// query the LLM couldn't turn into anything. Those come back with `message` set
// and `query_results` null — distinct from an empty array, which is a real
// search that matched nothing. Without this the screen would show "nothing
// matched" for what is actually a misconfiguration.
function assertGenerated(
  response: AudioMuseChatResponse,
): AudioMuseChatResponse {
  if (response.query_results == null) {
    throw new AudioMuseChatError(response.message ?? "no playlist generated");
  }
  return response;
}

export class AudioMuseChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioMuseChatError";
  }
}

async function streamChatPlaylist(
  userInput: string,
  { onLog, signal }: ChatPlaylistOptions,
): Promise<AudioMuseChatResponse> {
  const { serverUrl, apiToken, serverId } = useAudioMuseBase.getState();
  if (!serverUrl) throw new AudioMuseNotConfiguredError();

  const url = `${serverUrl.replace(/\/+$/, "")}/chat/api/chatPlaylistStream`;
  const response = await streamingFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
    },
    body: JSON.stringify({
      userInput,
      ...aiProviderField(),
      ...(serverId ? { server: serverId } : {}),
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`chatPlaylistStream failed with ${response.status}`);
  }

  let result: AudioMuseChatResponse | null = null;
  for await (const event of readServerSentEvents(response.body, signal)) {
    if (event.type === "log" && event.line) onLog?.(event.line);
    // The server reports a pipeline failure in-band, after a 200 — retrying on
    // the non-streaming endpoint would just run the same failing pipeline.
    if (event.type === "error") {
      throw new AudioMuseChatError(event.error ?? "chat pipeline failed");
    }
    if (event.type === "done") result = event.response ?? null;
  }

  if (!result) {
    throw new Error("chatPlaylistStream ended without a done event");
  }
  return result;
}

async function requestChatPlaylist(
  userInput: string,
  signal?: AbortSignal,
): Promise<AudioMuseChatResponse> {
  const rsp = await audioMuseRequest<{ response: AudioMuseChatResponse }>(
    "/chat/api/chatPlaylist",
    {
      method: "post",
      data: { userInput, ...aiProviderField() },
      timeout: CHAT_TIMEOUT_MS,
      signal,
    },
  );
  return rsp.response;
}

// Both endpoints only *default* `ai_provider` to the deployment's
// AI_MODEL_PROVIDER, and answer "No AI provider selected" (with a 200) when that
// is NONE. Naming the provider is therefore what makes an instance that holds,
// say, Gemini credentials without a default provider actually generate. The
// model is left to the server, which keeps the key and the model name together.
function aiProviderField(): { ai_provider?: string } {
  const provider = getAiProvider();
  return provider ? { ai_provider: provider } : {};
}

// Minimal SSE reader: AudioMuse sends only `data:` lines (plus a `: stream-open`
// comment to force proxies to open the pipe), one JSON object per event,
// separated by a blank line.
async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<AudioMuseChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseServerSentEvent(chunk);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

function parseServerSentEvent(chunk: string): AudioMuseChatEvent | null {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    return JSON.parse(data) as AudioMuseChatEvent;
  } catch (error) {
    // A malformed frame is worth knowing about, but it must not kill a run that
    // is otherwise producing good events.
    reportError(error, {
      area: "api",
      api: "audiomuse",
      endpoint: "/chat/api/chatPlaylistStream",
    });
    return null;
  }
}
