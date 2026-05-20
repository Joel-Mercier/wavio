import type { Line, StructuredLyrics } from "@/services/openSubsonic/types";

export function findCurrentLineIndex(
  lines: Line[],
  positionMs: number,
): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lines[mid].start ?? 0;
    if (start <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

const LRC_TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function parseSyncedLrc(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    LRC_TIMESTAMP_RE.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((match = LRC_TIMESTAMP_RE.exec(raw)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fracRaw = match[3] ?? "0";
      const frac = Number(fracRaw.padEnd(3, "0").slice(0, 3));
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        stamps.push(minutes * 60_000 + seconds * 1000 + frac);
      }
      lastIndex = LRC_TIMESTAMP_RE.lastIndex;
    }
    if (stamps.length === 0) continue;
    const value = raw.slice(lastIndex).trim();
    for (const start of stamps) {
      lines.push({ value, start });
    }
  }
  lines.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return lines;
}

export function parseLrcToStructuredLyrics(
  record: {
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  } | null,
  displayTitle?: string,
  displayArtist?: string,
): StructuredLyrics | null {
  if (!record) return null;
  if (record.syncedLyrics) {
    const line = parseSyncedLrc(record.syncedLyrics);
    if (line.length > 0) {
      return {
        lang: "xxx",
        synced: true,
        line,
        displayTitle,
        displayArtist,
      };
    }
  }
  if (record.plainLyrics) {
    const line = record.plainLyrics
      .split(/\r?\n/)
      .map((v) => ({ value: v }))
      .filter((l) => l.value.length > 0);
    if (line.length > 0) {
      return {
        lang: "xxx",
        synced: false,
        line,
        displayTitle,
        displayArtist,
      };
    }
  }
  return null;
}
