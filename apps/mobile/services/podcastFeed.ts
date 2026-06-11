import { XMLParser } from "fast-xml-parser";

// Backend-agnostic RSS podcast-feed fetcher + parser. Deliberately free of any
// backend's concerns (no SQLite, no Subsonic envelope, no local id encoding): it
// returns a normalized `ParsedFeed` that each backend adapts to its own storage
// and response shape. Today the local backend consumes it (services/local/
// podcasts.ts) to self-host podcasts on-device; a future Jellyfin (or other)
// self-hosted implementation can reuse it unchanged.
//
// `parseFeed` is split out from `fetchAndParseFeed` so it can be unit-tested on a
// fixed XML string with no network.

export type ParsedFeedItem = {
  // Stable per-episode key. Falls back to the enclosure URL when the feed omits
  // a <guid>, so callers can dedupe episodes across feed refreshes.
  guid: string;
  title?: string;
  description?: string;
  // Epoch milliseconds, or undefined when <pubDate> is missing/unparseable.
  publishedAt?: number;
  durationSeconds?: number;
  enclosureUrl: string;
  enclosureType?: string;
  enclosureLength?: number;
  imageUrl?: string;
};

export type ParsedFeed = {
  title?: string;
  description?: string;
  author?: string;
  imageUrl?: string;
  items: ParsedFeedItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Tag/attribute namespaces (itunes:*, etc.) are preserved as part of the key,
  // which is what we key off below.
  trimValues: true,
});

export async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const res = await fetch(url, {
    headers: {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Podcast feed request failed (${res.status})`);
  }
  const xml = await res.text();
  return parseFeed(xml);
}

export function parseFeed(xml: string): ParsedFeed {
  const root = parser.parse(xml);
  const channel = root?.rss?.channel ?? root?.channel;
  if (!channel) {
    throw new Error("Not a valid RSS podcast feed");
  }

  const items = toArray(channel.item)
    .map(parseItem)
    .filter((item): item is ParsedFeedItem => item !== null);

  return {
    title: textOf(channel.title),
    description:
      textOf(channel.description) ?? textOf(channel["itunes:summary"]),
    author: authorOf(channel),
    imageUrl: imageUrlOf(channel.image) ?? hrefOf(channel["itunes:image"]),
    items,
  };
}

// Author isn't required by RSS 2.0, so try the fields hosts actually populate,
// in order of usefulness: <itunes:author>, then the <itunes:owner>'s
// <itunes:name>, then the RSS <managingEditor> (often an email) as a last resort.
function authorOf(channel: Record<string, unknown>): string | undefined {
  return (
    textOf(channel["itunes:author"]) ??
    ownerNameOf(channel["itunes:owner"]) ??
    textOf(channel.managingEditor)
  );
}

function ownerNameOf(owner: unknown): string | undefined {
  const node = first(owner);
  if (node && typeof node === "object") {
    return textOf((node as Record<string, unknown>)["itunes:name"]);
  }
  return undefined;
}

// --- helpers ---------------------------------------------------------------

function parseItem(item: unknown): ParsedFeedItem | null {
  if (!item || typeof item !== "object") return null;
  const it = item as Record<string, unknown>;

  const enclosure = first(it.enclosure) as Record<string, unknown> | undefined;
  const enclosureUrl = attr(enclosure, "@_url");
  // An episode with no audio enclosure isn't playable; skip it.
  if (!enclosureUrl) return null;

  const guid = textOf(it.guid) ?? enclosureUrl;
  const pubDate = textOf(it.pubDate);
  const published = pubDate ? Date.parse(pubDate) : Number.NaN;

  return {
    guid,
    title: textOf(it.title),
    description: textOf(it.description) ?? textOf(it["itunes:summary"]),
    publishedAt: Number.isNaN(published) ? undefined : published,
    durationSeconds: parseDuration(textOf(it["itunes:duration"])),
    enclosureUrl,
    enclosureType: attr(enclosure, "@_type"),
    enclosureLength: parseIntOrUndefined(attr(enclosure, "@_length")),
    imageUrl: hrefOf(it["itunes:image"]),
  };
}

// fast-xml-parser collapses a single child to an object and repeated children to
// an array; normalize to an array either way.
function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

// A text node is either a plain string/number or, when it also carries
// attributes, an object whose text lives under `#text`.
function textOf(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const text = (value as Record<string, unknown>)["#text"];
    if (typeof text === "string") return text.trim() || undefined;
    if (typeof text === "number") return String(text);
  }
  return undefined;
}

function attr(
  node: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const value = node?.[name];
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

// RSS <image><url>…</url></image>
function imageUrlOf(image: unknown): string | undefined {
  const node = first(image);
  if (typeof node === "string") return node.trim() || undefined;
  if (node && typeof node === "object") {
    return textOf((node as Record<string, unknown>).url);
  }
  return undefined;
}

// <itunes:image href="…"/>
function hrefOf(node: unknown): string | undefined {
  const value = first(node);
  if (value && typeof value === "object") {
    return attr(value as Record<string, unknown>, "@_href");
  }
  return undefined;
}

function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

// <itunes:duration> may be raw seconds ("3600") or a clock string
// ("HH:MM:SS" / "MM:SS"). Returns whole seconds, or undefined if unparseable.
function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value.includes(":")) {
    const parts = value.split(":").map((p) => Number.parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return undefined;
    return parts.reduce((acc, part) => acc * 60 + part, 0);
  }
  return parseIntOrUndefined(value);
}
