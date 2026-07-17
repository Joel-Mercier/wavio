import type {
  Agent,
  CueLine,
  Line,
  LyricCue,
  StructuredLyrics,
} from "@/services/openSubsonic/types";

export type LyricAlign = "left" | "right" | "center";

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
  // When several lines share a timestamp (original / romanization / translation),
  // highlight the first of the group (the original language) rather than the last.
  while (
    result > 0 &&
    (lines[result - 1].start ?? 0) === (lines[result].start ?? 0)
  ) {
    result--;
  }
  return result;
}

// A layer can claim `synced` while carrying no usable timestamps (Jellyfin marks
// synced from a `.some()` over its lines), and findCurrentLineIndex coerces a
// missing start to 0 — so callers must gate on this rather than on `synced`.
export function isSyncedLyrics(
  lyrics: StructuredLyrics | null | undefined,
): boolean {
  return !!lyrics?.synced && lyrics.line.some((l) => l.start != null);
}

export function findCurrentCueIndex(
  cues: LyricCue[],
  positionMs: number,
): number {
  if (cues.length === 0) return -1;
  let lo = 0;
  let hi = cues.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= positionMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function getCueLineForLine(
  lyrics: StructuredLyrics | null | undefined,
  lineIndex: number,
): CueLine | undefined {
  return lyrics?.cueLine?.find((c) => c.index === lineIndex);
}

export function hasKaraoke(
  lyrics: StructuredLyrics | null | undefined,
): boolean {
  return !!lyrics?.cueLine?.some((c) => !!c.cue?.length);
}

// Agents (multi-voice) live at the word level: each cueLine carries an agentId
// that resolves to an entry in the layer's `agents` list. Lines without a
// cueLine (or in single-voice tracks) resolve to no agent.
export function getAgentForLine(
  lyrics: StructuredLyrics | null | undefined,
  lineIndex: number,
): Agent | undefined {
  const agents = lyrics?.agents;
  if (!agents?.length) return undefined;
  const agentId = getCueLineForLine(lyrics, lineIndex)?.agentId;
  if (!agentId) return undefined;
  return agents.find((a) => a.id === agentId);
}

export function agentAlign(role: string | undefined): LyricAlign {
  switch (role) {
    case "voice":
      return "right";
    case "bg":
    case "group":
      return "center";
    default:
      return "left";
  }
}

// The kind layers (translation / pronunciation) are independent entries with no
// guaranteed 1:1 line alignment, so map each layer line onto the main line whose
// [start, nextStart) window contains it. Falls back to positional index mapping
// when the main layer is unsynced (no timestamps to bucket by).
export function alignLayerToMain(
  mainLines: Line[],
  layerLines: Line[] | undefined,
): Line[][] {
  const buckets: Line[][] = mainLines.map(() => []);
  if (!layerLines?.length || !mainLines.length) return buckets;

  const mainSynced = mainLines.some((l) => l.start != null);
  const layerSynced = layerLines.some((l) => l.start != null);

  if (!mainSynced || !layerSynced) {
    layerLines.forEach((line, i) => {
      if (i < buckets.length) buckets[i].push(line);
    });
    return buckets;
  }

  for (const line of layerLines) {
    const start = line.start ?? 0;
    const target = findCurrentLineIndex(mainLines, start);
    if (target >= 0) buckets[target].push(line);
    else if (buckets.length) buckets[0].push(line);
  }
  return buckets;
}

// Removes LRC time tokens left inside a line's text — either bracketed line
// stamps `[mm:ss.xx]` (leading or trailing, as some sources emit) or A2
// word-level stamps `<mm:ss.xx>` — then collapses the resulting gaps.
const LYRIC_TIME_TOKEN_RE = /[[<]\d{1,3}:\d{2}(?:[.:]\d{1,3})?[\]>]/g;

export function stripLyricTimeTokens(value: string): string {
  return value
    .replace(LYRIC_TIME_TOKEN_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeStructuredLyrics(
  lyrics: StructuredLyrics,
): StructuredLyrics {
  return {
    ...lyrics,
    line: lyrics.line.map((l) => ({
      ...l,
      value: stripLyricTimeTokens(l.value),
    })),
  };
}

const LRC_TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function parseSyncedLrc(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    LRC_TIMESTAMP_RE.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((match = LRC_TIMESTAMP_RE.exec(raw)) !== null) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fracRaw = match[3] ?? "0";
      const frac = Number(fracRaw.padEnd(3, "0").slice(0, 3));
      if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
        stamps.push(minutes * 60_000 + seconds * 1000 + frac);
      }
    }
    if (stamps.length === 0) continue;
    // Strip all stamps rather than slicing after the last one, so trailing-stamp
    // formats (`text[mm:ss.xx]`) keep their text instead of collapsing to empty.
    const value = stripLyricTimeTokens(raw);
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
      .map((v) => ({ value: stripLyricTimeTokens(v) }))
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
