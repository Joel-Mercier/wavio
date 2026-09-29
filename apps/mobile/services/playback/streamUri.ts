// Whether two URIs name the same stream, allowing for what a receiver does to
// them: entities left escaped, a vendor scheme bolted on (Sonos reports
// `x-sonos-http:` in front of anything it fetched over HTTP), the query
// reordered. Our own stream URLs also carry a salted auth token that differs on
// every call, so the same track built twice is two different strings.
//
// So the comparison is by identity, not text: the `id` query parameter when both
// sides have one — it is the track — and host plus path otherwise, which is what
// a radio stream or a podcast enclosure is identified by. Mirrors
// modules/upnp-cast's StreamUri.kt, which does the same check on the device side.
const VENDOR_PREFIXES = [
  "x-sonos-http:",
  "x-sonosapi-stream:",
  "x-rincon-mp3radio:",
  "x-file-cifs:",
  "x-sonos-spotify:",
];

type Parts = { host: string; path: string; id: string | null };

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parse(raw: string): Parts | null {
  let text = unescapeXml(raw.trim());
  for (const prefix of VENDOR_PREFIXES) {
    if (text.toLowerCase().startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  // No URL constructor to lean on in every runtime, and the shape is fixed
  // enough: optional scheme, authority, path, query.
  const match =
    /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i.exec(text);
  if (!match) return null;
  const [, host, path, query] = match;
  let id: string | null = null;
  if (query) {
    for (const pair of query.split("&")) {
      const [key, value = ""] = pair.split("=");
      if (key === "id") {
        id = decodeURIComponent(value);
        break;
      }
    }
  }
  return {
    host: host.toLowerCase(),
    path: path.replace(/\/+$/, "").toLowerCase(),
    id,
  };
}

export function sameStreamUri(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return false;
  if (left.id && right.id)
    return left.id === right.id && left.host === right.host;
  return left.host === right.host && left.path === right.path;
}
