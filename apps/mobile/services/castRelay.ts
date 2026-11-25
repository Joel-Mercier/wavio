import { Platform } from "react-native";
import { getNoBackupStorage } from "@/config/storage";
import Native, {
  type CastRelaySource,
  type CastServerSession,
} from "@/modules/cast-server";
import { hostnameFromUrl, isCertificateTrusted } from "@/modules/ssl-trust";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import { parseLocalTrackId } from "@/services/local/keys";
import { castContentUrl } from "@/services/playback/castContentUrl";
import { castMime, hostedElsewhere } from "@/services/playback/castMime";
import {
  activeRemoteTarget,
  subscribeRemoteChange,
} from "@/services/playback/remoteTarget";
import {
  requestHeadersForUrl,
  subscribeCustomHeaders,
} from "@/services/serverHeaders";
import { isUpnpTracing, upnpTrace } from "@/services/upnpTrace";
import { useAuthBase } from "@/stores/auth";
import type { QueueTrack } from "@/stores/queue";
import { isTailnetUrl } from "@/utils/serverUrl";

// Casting through the phone (modules/cast-server): for media a receiver can't
// fetch by itself, the phone serves it on its Wi-Fi address for as long as the
// cast session lasts, and the receiver is handed that URL instead.
//
// That covers every index-backed library — files on this phone, an SMB share
// behind a loopback bridge, a WebDAV server that wants an Authorization header —
// and the remote servers a receiver can't reach either: a single sign-on
// session's bearer token, Cloudflare Access style custom headers, a self-signed
// certificate only this app trusts, an address only on the tailnet. Everything
// else is still handed over directly: a receiver fetching from the server itself
// keeps the phone out of the path.
//
// Android only for now. iOS suspends an app that serves without playing audio
// itself shortly after it leaves the foreground; the iOS module exists, but is
// not switched on until that has been tested (AirPlay is the iOS answer).

export type CastOwner = "cast" | "upnp";

export type CastMedia = {
  url: string;
  mime: string;
  artworkUrl?: string;
  /** Served by this phone rather than fetched from where the media lives. */
  relayed: boolean;
};

type RelayReason = "library" | "headers" | "tailnet" | "selfSigned";

type PersistedSession = CastServerSession & { receiverHost: string };

const STORAGE_ID = "castRelay";
const SESSION_KEY = "session";

let session: (PersistedSession & { owner: CastOwner }) | null = null;
let serving: boolean | null = null;

export const isCastRelayAvailable = (): boolean =>
  Platform.OS === "android" && Native != null;

// ── Deciding ────────────────────────────────────────────────────────────────

function isLibraryTrack(track: QueueTrack): boolean {
  return (
    isIndexBackedType(useAuthBase.getState().serverType) &&
    parseLocalTrackId(track.id) != null
  );
}

// A URL a receiver could open at all: not a file on this phone, not a loopback
// bridge only this phone can reach.
function isNetworkUrl(url: string | undefined): url is string {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const host = hostnameFromUrl(url).toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
}

function carriesCredentials(url: string): boolean {
  return Object.keys(requestHeadersForUrl(url)).some(
    (name) => name.toLowerCase() !== "user-agent",
  );
}

// Whether a host's certificate is one only this app trusts, as last asked. The
// answer is a native call, and the load path must not wait on it: a renderer's
// poll about the outgoing track has to find the new load's generation already in
// place (services/upnp.ts). So the active server's host is asked ahead of time,
// every answer is refreshed behind its read, and a host never asked about counts
// as publicly trusted — a radio or podcast CDN, in practice.
const selfSignedHosts = new Map<string, boolean>();

function askSelfSigned(host: string): Promise<boolean> {
  return isCertificateTrusted(host)
    .catch(() => false)
    .then((trusted) => {
      selfSignedHosts.set(host, trusted);
      return trusted;
    });
}

function isSelfSigned(url: string): boolean {
  const host = hostnameFromUrl(url);
  const known = selfSignedHosts.get(host);
  void askSelfSigned(host);
  return known === true;
}

function warmActiveServer(url: string | undefined) {
  if (url?.startsWith("https://")) void askSelfSigned(hostnameFromUrl(url));
}

warmActiveServer(useAuthBase.getState().url);
useAuthBase.subscribe?.((state, previous) => {
  if (state.url !== previous.url) warmActiveServer(state.url);
});

// Radio streams, podcast enclosures and audiobook session URLs are public or
// carry their own token. A bearer the app holds for the same origin (an
// integration's) is for its API, not something a receiver needs.
function needsHeaders(track: QueueTrack, url: string): boolean {
  return !hostedElsewhere(track) && carriesCredentials(url);
}

function relayReason(
  track: QueueTrack,
  direct: string | undefined,
): RelayReason | null {
  if (isLibraryTrack(track)) return "library";
  if (!isNetworkUrl(direct)) return null;
  if (needsHeaders(track, direct)) return "headers";
  if (isTailnetUrl(direct)) return "tailnet";
  if (direct.startsWith("https://") && isSelfSigned(direct)) {
    return "selfSigned";
  }
  return null;
}

function relaySource(
  track: QueueTrack,
  direct: string | undefined,
): CastRelaySource | null {
  if (isLibraryTrack(track)) {
    const uri = parseLocalTrackId(track.id);
    if (uri && /^(file|content):\/\//i.test(uri)) return { kind: "local", uri };
  }
  if (!direct || !/^https?:\/\//i.test(direct)) return null;
  return {
    kind: "upstream",
    url: direct,
    headers: requestHeadersForUrl(direct),
  };
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/aiff": "aiff",
  "audio/x-ms-wma": "wma",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function imageMime(uri: string): string {
  const suffix = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (suffix === "png") return "image/png";
  if (suffix === "webp") return "image/webp";
  return "image/jpeg";
}

// ── Registering ─────────────────────────────────────────────────────────────

// Upstream sources this session serves, newest last, so their headers can be
// sent again when they change: a single sign-on token refreshed mid-track would
// otherwise leave every later range request on the expired one. Bounded like the
// native side's own table.
const MAX_UPSTREAMS = 16;
const upstreams = new Map<string, { url: string; ext: string; mime: string }>();

function register(
  id: string,
  source: CastRelaySource,
  ext: string,
  mime: string,
): string | null {
  if (!Native) return null;
  if (source.kind === "upstream") {
    upstreams.delete(id);
    upstreams.set(id, { url: source.url, ext, mime });
    while (upstreams.size > MAX_UPSTREAMS) {
      const oldest = upstreams.keys().next().value;
      if (oldest === undefined) break;
      upstreams.delete(oldest);
    }
  }
  return Native.register(id, source, ext, mime);
}

subscribeCustomHeaders(() => {
  if (!Native || !session) return;
  for (const [id, { url, ext, mime }] of upstreams) {
    Native.register(
      id,
      { kind: "upstream", url, headers: requestHeadersForUrl(url) },
      ext,
      mime,
    );
  }
});

// ── Session ─────────────────────────────────────────────────────────────────

function readPersisted(): PersistedSession | null {
  try {
    const raw = getNoBackupStorage(STORAGE_ID).getString(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedSession | null) {
  const storage = getNoBackupStorage(STORAGE_ID);
  if (value) storage.set(SESSION_KEY, JSON.stringify(value));
  else storage.remove(SESSION_KEY);
}

/**
 * The relay session for `owner`'s receiver, opened when there is none.
 *
 * `resume` continues the session a receiver may still be fetching from after a
 * restart: same token, same port, so the URL it holds is good again. A new
 * receiver gets a new token, so a URL handed to one device never works for the
 * next.
 */
function ensureSession(
  receiverHost: string,
  owner: CastOwner,
  resume = false,
): PersistedSession | null {
  if (!Native) return null;
  if (session?.receiverHost === receiverHost && session.owner === owner) {
    Native.setRequestEvents(isUpnpTracing());
    return session;
  }
  if (session) endSessionNow();
  const persisted = readPersisted();
  const continuing = resume && persisted?.receiverHost === receiverHost;
  const opened = Native.startSession(
    receiverHost,
    persisted?.port ?? 0,
    continuing ? persisted.token : null,
  );
  if (!opened) {
    upnpTrace(`relay: no local network address toward ${receiverHost}`);
    return null;
  }
  session = { ...opened, receiverHost, owner };
  serving = null;
  writePersisted({ ...opened, receiverHost });
  Native.setRequestEvents(isUpnpTracing());
  upnpTrace(
    `relay: ${continuing ? "resumed" : "opened"} on ${opened.host}:${opened.port} for ${receiverHost}`,
  );
  syncServing();
  return session;
}

function endSessionNow() {
  Native?.endSession();
  session = null;
  serving = null;
  upstreams.clear();
  writePersisted(null);
}

/** Ends `owner`'s relay session, if it has one: the receiver is gone. */
export function endCastRelaySession(owner: CastOwner): void {
  if (!session || session.owner !== owner) return;
  upnpTrace("relay: closed");
  endSessionNow();
}

// The phone has to stay awake while a receiver plays from it, and only then.
function syncServing() {
  if (!Native || !session) return;
  const target = activeRemoteTarget();
  const snapshot = target?.readSnapshot();
  const next = !!snapshot && (snapshot.playing || snapshot.buffering);
  if (next === serving) return;
  serving = next;
  Native.setServing(next);
}

subscribeRemoteChange(syncServing);

Native?.addListener("request", (request) => {
  upnpTrace(
    `SRV ${request.client}${request.fromReceiver ? "" : " (not the receiver)"} ` +
      `${request.method} ${request.key || "-"} range=${request.range ?? "none"} ` +
      `→ ${request.status} ${request.bytes}B in ${Math.round(request.ms)}ms`,
  );
});

// ── Resolving what a receiver is handed ─────────────────────────────────────

function relayedArtwork(
  track: QueueTrack,
  relayAll: boolean,
): string | undefined {
  const art = track.artwork;
  if (!art || !Native || !session) return undefined;
  if (/^file:\/\//i.test(art)) {
    return (
      register(
        `art:${art}`,
        { kind: "local", uri: art },
        EXTENSION_BY_MIME[imageMime(art)] ?? "jpg",
        imageMime(art),
      ) ?? undefined
    );
  }
  if (!isNetworkUrl(art)) return undefined;
  if (!relayAll && !carriesCredentials(art) && !isTailnetUrl(art)) return art;
  return (
    register(
      `art:${art}`,
      { kind: "upstream", url: art, headers: requestHeadersForUrl(art) },
      "jpg",
      "image/jpeg",
    ) ?? undefined
  );
}

/**
 * What to hand a receiver for `track`: the URL it fetches, the type to declare,
 * and a cover it can reach. Null when there is nothing it could play: a track
 * only this phone can read, or one that needs credentials, with no relay to
 * serve it (iOS, an old build, no Wi-Fi, a receiver whose address is unknown).
 *
 * Synchronous on purpose; see `selfSignedHosts`.
 */
export function resolveCastMedia(
  track: QueueTrack,
  receiverHost: string | null,
  owner: CastOwner,
): CastMedia | null {
  const direct = castContentUrl(track);
  const reason =
    isCastRelayAvailable() && receiverHost ? relayReason(track, direct) : null;

  if (!reason) {
    if (!isNetworkUrl(direct)) return null;
    if (isLibraryTrack(track) || needsHeaders(track, direct)) return null;
    const art = track.artwork;
    return {
      url: direct,
      mime: castMime(track, direct),
      artworkUrl: isNetworkUrl(art) ? art : undefined,
      relayed: false,
    };
  }

  const source = relaySource(track, direct);
  if (!source || !receiverHost || !Native) return null;
  if (!ensureSession(receiverHost, owner)) return null;
  const mime = castMime(track, direct);
  const url = register(track.id, source, extensionFor(track, mime), mime);
  if (!url) return null;
  upnpTrace(`relay: ${track.id} (${reason}) via ${redactRelayUrl(url)}`);
  return {
    url,
    mime,
    artworkUrl: relayedArtwork(track, reason !== "library"),
    relayed: true,
  };
}

function extensionFor(track: QueueTrack, mime: string): string {
  return (
    EXTENSION_BY_MIME[mime] ??
    (typeof track.suffix === "string" ? track.suffix : "bin")
  );
}

/**
 * Picks a session back up after a restart, for a receiver still playing
 * `track` from a URL this phone served: same token, same port, the track
 * registered again under the same key. Without it the receiver's next range
 * request finds nothing listening.
 */
export async function resumeCastRelay(
  track: QueueTrack | null,
  receiverHost: string | null,
  owner: CastOwner,
): Promise<void> {
  if (!track || !receiverHost || !isCastRelayAvailable()) return;
  const direct = castContentUrl(track);
  // Unlike a load, a resume can wait: ask about the certificate now rather than
  // trust whatever the cache holds this early after a cold start.
  if (direct?.startsWith("https://")) {
    await askSelfSigned(hostnameFromUrl(direct));
  }
  const reason = relayReason(track, direct);
  if (!reason) return;
  if (!ensureSession(receiverHost, owner, true)) return;
  const source = relaySource(track, direct);
  if (!source) return;
  const mime = castMime(track, direct);
  register(track.id, source, extensionFor(track, mime), mime);
  relayedArtwork(track, reason !== "library");
}

/**
 * Whether `url` is one this phone served, and the receiver has fetched nothing
 * at all from the phone this session. A receiver that refuses a track's type
 * fetches nothing for it either, so a single track's count can't tell the two
 * apart; one that has fetched anything before can reach the phone.
 */
export function relayNeverReached(url: string | undefined): boolean {
  if (!url || !session || !Native) return false;
  if (!url.startsWith("http://") || !url.includes(`/${session.token}/`)) {
    return false;
  }
  return Native.requestCount(url) === 0 && Native.sessionRequestCount() === 0;
}

/** A relay URL with its session token hidden, for logs. */
export function redactRelayUrl(url: string): string {
  return url.split("?")[0].replace(/\/[0-9a-f]{32}\//, "/…/");
}

/** Test seam. */
export function __resetCastRelay(): void {
  session = null;
  serving = null;
  upstreams.clear();
  selfSignedHosts.clear();
}
