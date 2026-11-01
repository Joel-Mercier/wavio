import type {
  Agent,
  CueLine,
  Line,
  LyricCue,
  StructuredLyrics,
} from "@/services/openSubsonic/types";

export type LyricAlign = "left" | "right" | "center";

export const LYRIC_FLEX_ALIGN: Record<
  LyricAlign,
  "flex-start" | "flex-end" | "center"
> = {
  left: "flex-start",
  right: "flex-end",
  center: "center",
};

export const KARAOKE_UPCOMING_COLOR = "rgba(255,255,255,0.4)";

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

export type FillWord = { text: string; start: number; end: number };

const FALLBACK_CUE_MS = 600;
const LAST_CUE_MIN_CAP_MS = 1500;
const LAST_CUE_MEDIAN_FACTOR = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Servers end a line's last cue where the next line starts, so before a pause
// the final word would crawl across the whole gap. It's capped relative to the
// line's own pace, which still leaves room for a held note.
export function buildFillWords(cueLine: CueLine): FillWord[] {
  const cues = cueLine.cue ?? [];
  const words = cues
    .map((cue, i) => {
      const end =
        cue.end ??
        cues[i + 1]?.start ??
        cueLine.end ??
        cue.start + FALLBACK_CUE_MS;
      return {
        text: cue.value.trim(),
        start: cue.start,
        end: Math.max(cue.start, end),
      };
    })
    .filter((w) => w.text.length > 0);
  const last = words[words.length - 1];
  if (last) {
    const others = words.slice(0, -1).map((w) => w.end - w.start);
    const cap = Math.max(
      LAST_CUE_MIN_CAP_MS,
      others.length ? LAST_CUE_MEDIAN_FACTOR * median(others) : 0,
    );
    last.end = Math.min(last.end, last.start + cap);
  }
  return words;
}

export function wordFillProgress(
  positionMs: number,
  start: number,
  end: number,
): number {
  "worklet";
  if (positionMs >= end) return 1;
  if (positionMs <= start) return 0;
  return (positionMs - start) / (end - start);
}

const CLOCK_SNAP_MS = 250;

// Playback reports land every ~250 ms and trail the frame-integrated position by
// their own latency, so a report slightly behind is ignored (stepping back would
// make the fill flicker); a report ahead or far off (a seek) is taken as is.
export function reconcileLyricsClock(
  extrapolatedMs: number,
  reportedMs: number,
): number {
  "worklet";
  const drift = reportedMs - extrapolatedMs;
  if (drift >= 0 || drift < -CLOCK_SNAP_MS) return reportedMs;
  return extrapolatedMs;
}

export function hasKaraoke(
  lyrics: StructuredLyrics | null | undefined,
): boolean {
  return !!lyrics?.cueLine?.some((c) => !!c.cue?.length);
}

// A server can answer getLyricsBySongId with a structured entry that holds no
// actual text — a file tagged with an empty LYRICS frame, an empty .lrc
// sidecar, or lines that were nothing but time tokens before sanitizing. Such an
// entry must not count as lyrics: it renders as a blank view *and* (in
// useSyncedLyrics) suppresses the LRCLIB fallback for a track LRCLIB has.
export function hasLyricContent(
  lyrics: StructuredLyrics | null | undefined,
): boolean {
  return !!lyrics?.line?.some((l) => l.value.trim().length > 0);
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
// Same sign as OpenSubsonic's `offset`: positive shows the lyrics earlier.
const LRC_OFFSET_RE = /^\s*\[offset:\s*([+-]?\d+)\s*\]/im;
const A2_WORD_STAMP_RE = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function lrcStampToMs(match: RegExpExecArray): number | null {
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const frac = Number((match[3] ?? "0").padEnd(3, "0").slice(0, 3));
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return minutes * 60_000 + seconds * 1000 + frac;
}

// Enhanced (A2) LRC times each word with a `<mm:ss.xx>` stamp in front of it;
// the first word starts at the line stamp unless it carries its own, and a
// trailing stamp with no text after it closes the last word.
function parseA2Cues(text: string, lineStart: number): LyricCue[] {
  const cues: LyricCue[] = [];
  let start = lineStart;
  let cursor = 0;
  let byte = 0;
  const push = (value: string, end?: number) => {
    if (!value.trim()) return;
    cues.push({
      start,
      end,
      byteStart: byte,
      byteEnd: byte + value.length,
      value,
    });
    byte += value.length;
  };
  A2_WORD_STAMP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
  while ((match = A2_WORD_STAMP_RE.exec(text)) !== null) {
    const stamp = lrcStampToMs(match);
    if (stamp == null) continue;
    push(text.slice(cursor, match.index), stamp);
    start = stamp;
    cursor = match.index + match[0].length;
  }
  if (cursor === 0) return [];
  push(text.slice(cursor));
  return cues;
}

function parseSyncedLrc(text: string): {
  line: Line[];
  cueLine: CueLine[];
} {
  const entries: { line: Line; cues: LyricCue[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    LRC_TIMESTAMP_RE.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
    while ((match = LRC_TIMESTAMP_RE.exec(raw)) !== null) {
      const stamp = lrcStampToMs(match);
      if (stamp != null) stamps.push(stamp);
    }
    if (stamps.length === 0) continue;
    // Strip all stamps rather than slicing after the last one, so trailing-stamp
    // formats (`text[mm:ss.xx]`) keep their text instead of collapsing to empty.
    const value = stripLyricTimeTokens(raw);
    // Word stamps are absolute, so they only fit a line sung once.
    const cues =
      stamps.length === 1
        ? parseA2Cues(raw.replace(LRC_TIMESTAMP_RE, ""), stamps[0])
        : [];
    for (const start of stamps) {
      entries.push({ line: { value, start }, cues });
    }
  }
  entries.sort((a, b) => (a.line.start ?? 0) - (b.line.start ?? 0));
  const cueLine: CueLine[] = [];
  entries.forEach(({ line, cues }, index) => {
    if (!cues.length) return;
    cueLine.push({
      index,
      start: line.start,
      end: entries[index + 1]?.line.start,
      value: line.value,
      cue: cues,
    });
  });
  return { line: entries.map((e) => e.line), cueLine };
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
    const { line, cueLine } = parseSyncedLrc(record.syncedLyrics);
    if (line.length > 0) {
      const offset = LRC_OFFSET_RE.exec(record.syncedLyrics)?.[1];
      return {
        lang: "xxx",
        synced: true,
        line,
        ...(cueLine.length ? { cueLine } : {}),
        ...(offset ? { offset: Number(offset) } : {}),
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
