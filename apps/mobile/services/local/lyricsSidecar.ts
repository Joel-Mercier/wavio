import type { FileSource, RemoteEntry } from "@/services/fileSource/types";
import type { StructuredLyrics } from "@/services/openSubsonic/types";
import { parseLrcToStructuredLyrics } from "@/utils/lyrics";
import { parseTtmlLyrics } from "@/utils/ttmlLyrics";

// Sidecar lyrics: the `.lrc` / `.ttml` that sits next to a track, named after
// it (`Song.lrc`, or `Song.mp3.lrc` as some taggers write it). Like folderArt.ts
// this sits above the FileSource seam, and matching costs no round trip since
// the scanner already holds the directory listing. Only the chosen file's URI is
// indexed; its text is read when the lyrics are asked for, so an edited sheet
// shows up without a rescan.

// Richest first: word timings, voices and translations over plain lines.
const SIDECAR_EXTENSIONS = ["ttml", "elrc", "lrc", "txt"] as const;
type SidecarExtension = (typeof SIDECAR_EXTENSIONS)[number];

const MAX_SIDECAR_BYTES = 1024 * 1024;

function sidecarExtension(name: string): SidecarExtension | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  return (SIDECAR_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as SidecarExtension)
    : undefined;
}

/** A directory's lyric files, keyed by lowercased filename. */
export function indexLyricSidecars(
  entries: RemoteEntry[],
): Map<string, RemoteEntry> {
  const sidecars = new Map<string, RemoteEntry>();
  for (const entry of entries) {
    if (entry.isDirectory || !sidecarExtension(entry.name)) continue;
    sidecars.set(entry.name.toLowerCase(), entry);
  }
  return sidecars;
}

export function pickLyricsSidecar(
  audioName: string,
  sidecars: Map<string, RemoteEntry>,
): RemoteEntry | undefined {
  if (sidecars.size === 0) return undefined;
  const name = audioName.toLowerCase();
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  for (const extension of SIDECAR_EXTENSIONS) {
    const match =
      sidecars.get(`${stem}.${extension}`) ??
      sidecars.get(`${name}.${extension}`);
    if (match) return match;
  }
  return undefined;
}

export const isPlainTextSidecar = (uri: string): boolean =>
  sidecarExtension(uri) === "txt";

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units: number[] = [];
  for (let i = 2; i + 1 < bytes.length; i += 2) {
    units.push(
      littleEndian
        ? bytes[i] | (bytes[i + 1] << 8)
        : (bytes[i] << 8) | bytes[i + 1],
    );
  }
  let text = "";
  for (let i = 0; i < units.length; i += 8192) {
    text += String.fromCharCode(...units.slice(i, i + 8192));
  }
  return text;
}

// Windows lyric editors save UTF-16 with a BOM; everything else is read as
// UTF-8, the encoding every format here specifies.
export function decodeLyricsText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decodeUtf16(bytes, true);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeUtf16(bytes, false);
  return new TextDecoder().decode(bytes).replace(/^﻿/, "");
}

export async function readLyricsSidecar(
  source: FileSource,
  uri: string,
): Promise<string> {
  const reader = await source.openReader(uri);
  try {
    return decodeLyricsText(await reader.read(0, MAX_SIDECAR_BYTES));
  } finally {
    reader.close();
  }
}

// Embedded tags and `.txt` files hold either plain text or LRC that a tagger
// wrote into the unsynced frame; timestamps decide which.
export function parseLyricsText(
  text: string,
  displayTitle?: string,
  displayArtist?: string,
): StructuredLyrics | null {
  const synced = parseLrcToStructuredLyrics(
    { syncedLyrics: text },
    displayTitle,
    displayArtist,
  );
  if (synced) return { ...synced, lang: "und" };
  if (!text.trim()) return null;
  return {
    lang: "und",
    synced: false,
    // Blank lines are kept: they're the stanza breaks.
    line: text.split(/\r?\n/).map((value) => ({ value })),
    displayTitle,
    displayArtist,
  };
}

export function parseLyricsSidecar(
  uri: string,
  text: string,
  displayTitle?: string,
  displayArtist?: string,
): StructuredLyrics[] {
  if (sidecarExtension(uri) === "ttml") {
    return parseTtmlLyrics(text, displayTitle, displayArtist);
  }
  const lyrics = parseLyricsText(text, displayTitle, displayArtist);
  return lyrics ? [lyrics] : [];
}
