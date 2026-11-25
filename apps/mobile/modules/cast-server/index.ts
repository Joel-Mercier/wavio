import { requireOptionalNativeModule } from "expo";

/**
 * Where a registered track's bytes come from: a file this phone opens itself
 * (`file://`, or a SAF `content://` document), or an HTTP resource fetched for
 * the receiver with headers it couldn't send.
 */
export type CastRelaySource =
  | { kind: "local"; uri: string }
  | { kind: "upstream"; url: string; headers: Record<string, string> };

export type CastServerSession = { host: string; port: number; token: string };

/** One request the server answered, for the casting log. */
export type CastServerRequest = {
  client: string;
  /** False when someone other than the session's receiver asked. */
  fromReceiver: boolean;
  method: string;
  /** The first 8 characters of the key, never the token. */
  key: string;
  range: string | null;
  status: number;
  bytes: number;
  ms: number;
};

type CastServerNativeModule = {
  /**
   * Opens (or keeps) the listener for a session with the receiver at
   * `receiverHost`. Pass the previous session's `token` and `port` to continue
   * it after a restart; null when the phone is on no network a receiver could
   * reach it on.
   */
  startSession(
    receiverHost: string,
    preferredPort: number,
    token: string | null,
  ): CastServerSession | null;
  /**
   * The URL the receiver fetches `id` from. The same id in the same session
   * always gives the same URL, and the URL carries no trace of the id. Null without a session or for a source the
   * platform can't serve.
   */
  register(
    id: string,
    source: CastRelaySource,
    ext: string,
    mime: string,
  ): string | null;
  /** How many requests reached `url`. */
  requestCount(url: string): number;
  /** How many requests reached any registered source this session. */
  sessionRequestCount(): number;
  /** Keeps the phone and its Wi-Fi awake while the receiver plays. */
  setServing(active: boolean): void;
  setRequestEvents(enabled: boolean): void;
  endSession(): void;
  addListener(
    event: "request",
    listener: (request: CastServerRequest) => void,
  ): { remove: () => void };
};

// Optional so importing this is safe before a native rebuild.
const Native =
  requireOptionalNativeModule<CastServerNativeModule>("CastServer");

export default Native;
