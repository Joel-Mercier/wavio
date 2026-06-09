import { File, FileMode } from "expo-file-system";

// Raw tag-frame reader for the fields the OS metadata APIs
// (`MediaMetadataRetriever` / `AVMetadataItem`) don't surface: ReplayGain,
// embedded lyrics, multi-value artists and MusicBrainz IDs. It reads only the
// tag region at the front of the file (ID3v2's header declares its own size;
// FLAC metadata blocks precede the audio), never the audio payload, so it stays
// cheap and memory-safe even for large files. Runs identically on iOS and
// Android since it's pure JS over `expo-file-system` byte reads.
//
// Supported containers: MP3 (ID3v2.2 / 2.3 / 2.4) and FLAC (Vorbis comments).
// M4A/MP4 freeform atoms are not parsed yet — those tracks just skip enrichment.

export type ReplayGain = {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
};

export type RawTagData = {
  replayGain?: ReplayGain;
  lyrics?: string;
  artists?: string[];
  musicBrainzId?: string;
};

// Cap how much we'll pull for a tag region, as a safety valve against a
// corrupt/huge declared size. 4 MB comfortably covers tags with embedded art.
const MAX_TAG_BYTES = 4 * 1024 * 1024;

export async function readRawTags(uri: string): Promise<RawTagData> {
  let handle: ReturnType<File["open"]> | undefined;
  try {
    handle = new File(uri).open(FileMode.ReadOnly);
    handle.offset = 0;
    const signature = handle.readBytes(4);

    // "ID3"
    if (
      signature[0] === 0x49 &&
      signature[1] === 0x44 &&
      signature[2] === 0x33
    ) {
      return readId3(handle);
    }
    // "fLaC"
    if (
      signature[0] === 0x66 &&
      signature[1] === 0x4c &&
      signature[2] === 0x61 &&
      signature[3] === 0x43
    ) {
      return readFlac(handle);
    }
    return {};
  } catch {
    // Enrichment is best-effort; never let it break extraction.
    return {};
  } finally {
    handle?.close();
  }
}

type Handle = ReturnType<File["open"]>;

// ---------------------------------------------------------------------------
// ID3v2 (MP3)
// ---------------------------------------------------------------------------

function readId3(handle: Handle): RawTagData {
  handle.offset = 0;
  const header = handle.readBytes(10);
  const major = header[3];
  const flags = header[5];
  const unsync = (flags & 0x80) !== 0;
  const hasExtendedHeader = (flags & 0x40) !== 0;
  const tagSize = synchsafe(header, 6);
  if (tagSize <= 0 || tagSize > MAX_TAG_BYTES) return {};

  handle.offset = 10;
  let body: Uint8Array = handle.readBytes(tagSize);
  if (unsync) body = deunsynchronize(body);

  let pos = 0;
  // Skip the extended header if present (its first 4 bytes give its size:
  // synchsafe in v2.4, a plain int in v2.3).
  if (hasExtendedHeader) {
    const extSize = major >= 4 ? synchsafe(body, 0) : readUInt32BE(body, 0);
    pos += extSize;
  }

  return parseId3Frames(body, major, pos);
}

/** Parse ID3 frames from a (de-unsynchronized) tag body. Exported for tests. */
export function parseId3Frames(
  body: Uint8Array,
  major: number,
  start = 0,
): RawTagData {
  const result: RawTagData = {};
  const replayGain: ReplayGain = {};
  const v22 = major <= 2;
  const idLen = v22 ? 3 : 4;
  const headerLen = v22 ? 6 : 10;

  let pos = start;
  while (pos + headerLen <= body.length) {
    const id = latin1(body, pos, pos + idLen);
    if (id.charCodeAt(0) === 0 || !/^[A-Z0-9]+$/.test(id)) break; // padding / end

    let size: number;
    if (v22) {
      size = (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5];
    } else if (major >= 4) {
      size = synchsafe(body, pos + 4);
    } else {
      size = readUInt32BE(body, pos + 4);
    }

    const dataStart = pos + headerLen;
    const dataEnd = dataStart + size;
    if (size <= 0 || dataEnd > body.length) break;
    const data = body.subarray(dataStart, dataEnd);

    if (id === "TXXX" || id === "TXX") {
      const [desc, value] = splitTextFrame(data);
      applyTxxx(result, replayGain, desc, value);
    } else if (id === "TPE1" || id === "TP1") {
      const value = decodeTextFrame(data);
      const artists = splitArtists(value);
      if (artists.length) result.artists = artists;
    } else if (id === "USLT" || id === "ULT") {
      const lyrics = parseUslt(data);
      if (lyrics) result.lyrics = lyrics;
    } else if (id === "UFID" || id === "UFI") {
      const mbid = parseUfid(data);
      if (mbid) result.musicBrainzId = mbid;
    }

    pos = dataEnd;
  }

  if (Object.keys(replayGain).length) result.replayGain = replayGain;
  return result;
}

function applyTxxx(
  result: RawTagData,
  replayGain: ReplayGain,
  desc: string,
  value: string,
) {
  const key = desc.trim().toUpperCase();
  switch (key) {
    case "REPLAYGAIN_TRACK_GAIN":
      replayGain.trackGain = parseDb(value);
      break;
    case "REPLAYGAIN_ALBUM_GAIN":
      replayGain.albumGain = parseDb(value);
      break;
    case "REPLAYGAIN_TRACK_PEAK":
      replayGain.trackPeak = parseFloatSafe(value);
      break;
    case "REPLAYGAIN_ALBUM_PEAK":
      replayGain.albumPeak = parseFloatSafe(value);
      break;
    default:
      if (
        key.includes("MUSICBRAINZ") &&
        key.includes("TRACK") &&
        !result.musicBrainzId
      ) {
        result.musicBrainzId = value.trim() || undefined;
      }
  }
}

function parseUslt(data: Uint8Array): string | undefined {
  if (data.length < 4) return undefined;
  const encoding = data[0];
  // [encoding][language:3][descriptor][\0][text]
  const payload = data.subarray(4);
  const decoded = decodeText(payload, encoding);
  const parts = decoded.split("\u0000");
  // Descriptor comes first, lyrics text after.
  const text = (parts.length > 1 ? parts.slice(1).join("\n") : parts[0]) ?? "";
  return cleanup(text) || undefined;
}

function parseUfid(data: Uint8Array): string | undefined {
  // [owner identifier]\0[binary id]
  const nul = data.indexOf(0);
  if (nul < 0) return undefined;
  const owner = latin1(data, 0, nul).toLowerCase();
  if (!owner.includes("musicbrainz")) return undefined;
  return cleanup(latin1(data, nul + 1, data.length)) || undefined;
}

/** Split a TXXX/TXX frame into [description, value]. */
function splitTextFrame(data: Uint8Array): [string, string] {
  if (data.length < 1) return ["", ""];
  const encoding = data[0];
  const decoded = decodeText(data.subarray(1), encoding);
  const idx = decoded.indexOf("\u0000");
  if (idx < 0) return [decoded, ""];
  return [decoded.slice(0, idx), decoded.slice(idx + 1)];
}

/** Decode a plain text frame (T*** other than TXXX). */
function decodeTextFrame(data: Uint8Array): string {
  if (data.length < 1) return "";
  return decodeText(data.subarray(1), data[0]);
}

// ---------------------------------------------------------------------------
// FLAC (Vorbis comments)
// ---------------------------------------------------------------------------

function readFlac(handle: Handle): RawTagData {
  let offset = 4; // past "fLaC"
  for (let guard = 0; guard < 128; guard++) {
    handle.offset = offset;
    const blockHeader = handle.readBytes(4);
    if (blockHeader.length < 4) break;
    const isLast = (blockHeader[0] & 0x80) !== 0;
    const blockType = blockHeader[0] & 0x7f;
    const length =
      (blockHeader[1] << 16) | (blockHeader[2] << 8) | blockHeader[3];

    if (blockType === 4) {
      if (length <= 0 || length > MAX_TAG_BYTES) return {};
      handle.offset = offset + 4;
      return parseVorbisComments(handle.readBytes(length));
    }
    if (isLast) break;
    offset += 4 + length;
  }
  return {};
}

/** Parse a FLAC VORBIS_COMMENT block body. Exported for tests. */
export function parseVorbisComments(bytes: Uint8Array): RawTagData {
  const result: RawTagData = {};
  const replayGain: ReplayGain = {};
  const artists: string[] = [];

  let pos = 0;
  const vendorLen = readUInt32LE(bytes, pos);
  pos += 4 + vendorLen;
  if (pos + 4 > bytes.length) return {};
  const count = readUInt32LE(bytes, pos);
  pos += 4;

  for (let i = 0; i < count; i++) {
    if (pos + 4 > bytes.length) break;
    const len = readUInt32LE(bytes, pos);
    pos += 4;
    if (pos + len > bytes.length) break;
    const comment = utf8(bytes, pos, pos + len);
    pos += len;

    const eq = comment.indexOf("=");
    if (eq < 0) continue;
    const key = comment.slice(0, eq).trim().toUpperCase();
    const value = comment.slice(eq + 1);

    switch (key) {
      case "REPLAYGAIN_TRACK_GAIN":
        replayGain.trackGain = parseDb(value);
        break;
      case "REPLAYGAIN_ALBUM_GAIN":
        replayGain.albumGain = parseDb(value);
        break;
      case "REPLAYGAIN_TRACK_PEAK":
        replayGain.trackPeak = parseFloatSafe(value);
        break;
      case "REPLAYGAIN_ALBUM_PEAK":
        replayGain.albumPeak = parseFloatSafe(value);
        break;
      case "ARTIST":
        artists.push(...splitArtists(value));
        break;
      case "LYRICS":
      case "UNSYNCEDLYRICS":
        if (!result.lyrics) result.lyrics = cleanup(value) || undefined;
        break;
      case "MUSICBRAINZ_TRACKID":
        if (!result.musicBrainzId)
          result.musicBrainzId = value.trim() || undefined;
        break;
    }
  }

  if (artists.length) result.artists = dedupe(artists);
  if (Object.keys(replayGain).length) result.replayGain = replayGain;
  return result;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function splitArtists(value: string): string[] {
  // ID3v2.4 separates multiple values with \0; otherwise fall back to common
  // delimiters. Conservative: only split on "/" and ";" (not "&"/"feat." which
  // routinely appear inside a single legitimate artist name). A trailing NUL
  // terminator alone shouldn't suppress delimiter splitting, so only treat NUL
  // as the separator when it leaves more than one non-empty value.
  const byNul = value
    .split("\u0000")
    .map((p) => cleanup(p))
    .filter((p): p is string => p.length > 0);
  const parts = byNul.length > 1 ? byNul : (byNul[0] ?? "").split(/\s*[/;]\s*/);
  return dedupe(
    parts.map((p) => cleanup(p)).filter((p): p is string => p.length > 0),
  );
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/** Strip BOM, surrounding whitespace and trailing NULs. */
function cleanup(text: string): string {
  // Trim trailing NUL terminators without a regex control char (Biome forbids
  // those in regexes), then drop any BOM and surrounding whitespace.
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0) end--;
  return text
    .slice(0, end)
    .replace(/\uFEFF/g, "")
    .trim();
}

function parseDb(value: string): number | undefined {
  // e.g. "-7.59 dB" -> -7.59
  return parseFloatSafe(value.replace(/dB/i, ""));
}

function parseFloatSafe(value: string): number | undefined {
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : undefined;
}

function synchsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/** Reverse ID3v2 unsynchronization: every `FF 00` becomes `FF`. */
function deunsynchronize(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let j = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[j++] = bytes[i];
    if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
  }
  return out.subarray(0, j);
}

// --- text decoders (no TextDecoder dependency, for Hermes safety) -----------

/** Decode an ID3 text payload given its encoding byte. */
function decodeText(bytes: Uint8Array, encoding: number): string {
  switch (encoding) {
    case 1: // UTF-16 with BOM
    case 2: // UTF-16BE without BOM
      return utf16(bytes, encoding === 1);
    case 3: // UTF-8
      return utf8(bytes, 0, bytes.length);
    default: // 0 = ISO-8859-1
      return latin1(bytes, 0, bytes.length);
  }
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function utf16(bytes: Uint8Array, detectBom: boolean): string {
  let i = 0;
  let littleEndian = false;
  if (detectBom && bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      littleEndian = true;
      i = 2;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      i = 2;
    }
  }
  let out = "";
  for (; i + 1 < bytes.length; i += 2) {
    const unit = littleEndian
      ? bytes[i] | (bytes[i + 1] << 8)
      : (bytes[i] << 8) | bytes[i + 1];
    out += String.fromCharCode(unit);
  }
  return out;
}

function utf8(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  let i = start;
  while (i < end) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc0 && b < 0xe0) {
      const b2 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b & 0x1f) << 6) | b2);
    } else if (b >= 0xe0 && b < 0xf0) {
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      out += String.fromCharCode(((b & 0x0f) << 12) | (b2 << 6) | b3);
    } else {
      const b2 = bytes[i++] & 0x3f;
      const b3 = bytes[i++] & 0x3f;
      const b4 = bytes[i++] & 0x3f;
      let cp = ((b & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4;
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}
