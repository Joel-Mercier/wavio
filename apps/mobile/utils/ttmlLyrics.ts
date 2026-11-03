import { XMLParser } from "fast-xml-parser";
import type {
  Agent,
  CueLine,
  Line,
  LyricCue,
  StructuredLyrics,
} from "@/services/openSubsonic/types";

// Apple-style TTML lyrics (the `.ttml` sidecar Navidrome also reads), mapped to
// the same structured shape Navidrome serves for it: one `<p>` per line, one
// timed `<span>` per word, `ttm:agent` voices, `x-bg` background vocals, and
// translations / transliterations either in the head's iTunesMetadata (keyed by
// `itunes:key`) or inline as `x-translation` / `x-roman` spans.

type XmlNode = { [tag: string]: XmlNode[] | string | undefined } & {
  ":@"?: Record<string, string>;
  "#text"?: string;
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  // Whitespace between word spans is what separates the words.
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const BACKGROUND_ROLE = "x-bg";

const localName = (name: string) => name.slice(name.lastIndexOf(":") + 1);

function tagOf(node: XmlNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ":@" && key !== "#text") return localName(key);
  }
  return undefined;
}

function childrenOf(node: XmlNode): XmlNode[] {
  for (const key of Object.keys(node)) {
    if (key === ":@" || key === "#text") continue;
    const value = node[key];
    return Array.isArray(value) ? value : [];
  }
  return [];
}

// Matched by local name, since the prefix bound to a namespace is the file's
// choice (`ttm:agent`, `tts:agent`, …).
function attr(node: XmlNode, name: string): string | undefined {
  const attrs = node[":@"];
  if (!attrs) return undefined;
  for (const [key, value] of Object.entries(attrs)) {
    if (localName(key) === name) return value;
  }
  return undefined;
}

function findAll(nodes: XmlNode[], tag: string, out: XmlNode[] = []) {
  for (const node of nodes) {
    if (tagOf(node) === tag) out.push(node);
    else findAll(childrenOf(node), tag, out);
  }
  return out;
}

function textOf(node: XmlNode): string {
  if (node["#text"] != null) return String(node["#text"]);
  return childrenOf(node).map(textOf).join("");
}

const collapse = (text: string) => text.replace(/\s+/g, " ");

const OFFSET_TIME_RE = /^(\d+(?:\.\d+)?)(ms|h|m|s)$/;
const OFFSET_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

export function parseTtmlTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const offset = OFFSET_TIME_RE.exec(trimmed);
  if (offset) return Math.round(Number(offset[1]) * OFFSET_UNIT_MS[offset[2]]);
  const parts = trimmed.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p))) {
    return undefined;
  }
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return Math.round(seconds * 1000);
}

type ParsedLine = {
  line: Line;
  end?: number;
  agentId?: string;
  cues: LyricCue[];
  key?: string;
};

type InlineLayer = { lang: string; start?: number; value: string };

type LineBuilder = {
  cues: LyricCue[];
  text: string;
  background: LyricCue[];
  translations: InlineLayer[];
  pronunciations: InlineLayer[];
};

// Adjacent spans with no whitespace between them are syllables of one word;
// they merge so the word renders whole and fills across its full span.
function appendCue(
  cues: LyricCue[],
  start: number,
  end: number | undefined,
  value: string,
) {
  const prev = cues[cues.length - 1];
  if (prev && !/\s$/.test(prev.value)) {
    prev.value += value;
    prev.end = end ?? prev.end;
    return;
  }
  cues.push({ start, end, byteStart: 0, byteEnd: 0, value });
}

// Untimed text after a word (the space separating words, stray punctuation)
// belongs to that word; before any timed span it's the text of a spanless line.
function appendText(builder: LineBuilder, cues: LyricCue[], text: string) {
  const prev = cues[cues.length - 1];
  if (prev) prev.value = collapse(prev.value + text);
  else builder.text += text;
}

function walkLine(
  nodes: XmlNode[],
  builder: LineBuilder,
  cues: LyricCue[],
  lineStart: number | undefined,
) {
  for (const node of nodes) {
    if (node["#text"] != null) {
      appendText(builder, cues, String(node["#text"]));
      continue;
    }
    if (tagOf(node) !== "span") continue;
    const role = attr(node, "role");
    if (role === BACKGROUND_ROLE) {
      walkLine(childrenOf(node), builder, builder.background, lineStart);
      continue;
    }
    if (role === "x-translation" || role === "x-roman") {
      const layer = {
        lang: attr(node, "lang") ?? "und",
        start: lineStart,
        value: collapse(textOf(node)).trim(),
      };
      if (layer.value) {
        (role === "x-translation"
          ? builder.translations
          : builder.pronunciations
        ).push(layer);
      }
      continue;
    }
    const start = parseTtmlTime(attr(node, "begin"));
    if (start == null) {
      walkLine(childrenOf(node), builder, cues, lineStart);
      continue;
    }
    const value = collapse(textOf(node));
    if (value.trim()) {
      appendCue(cues, start, parseTtmlTime(attr(node, "end")), value);
    }
  }
}

const lineValue = (cues: LyricCue[], fallback: string) =>
  (cues.length ? cues.map((c) => c.value).join("") : collapse(fallback)).trim();

function withOffsets(cues: LyricCue[]): LyricCue[] {
  let byte = 0;
  return cues.map((cue, i) => {
    // The last word also collected the markup's trailing indentation.
    const value = i === cues.length - 1 ? cue.value.trimEnd() : cue.value;
    const byteStart = byte;
    byte += value.length;
    return { ...cue, value, byteStart, byteEnd: byte };
  });
}

function parseAgents(head: XmlNode[]): Agent[] {
  let sawPerson = false;
  return findAll(head, "agent").flatMap((node) => {
    const id = attr(node, "id");
    if (!id) return [];
    const type = attr(node, "type");
    const role =
      type === "group"
        ? "group"
        : !sawPerson && type === "person"
          ? "main"
          : "voice";
    if (type === "person") sawPerson = true;
    const nameNode = findAll(childrenOf(node), "name")[0];
    const name = nameNode ? collapse(textOf(nameNode)).trim() : undefined;
    return [{ id, role, ...(name ? { name } : {}) }];
  });
}

function backgroundAgentId(agents: Agent[], base: string | undefined): string {
  const id = `bg:${base ?? ""}`;
  if (!agents.some((a) => a.id === id)) {
    const name = agents.find((a) => a.id === base)?.name;
    agents.push({ id, role: "bg", ...(name ? { name } : {}) });
  }
  return id;
}

function headLayers(
  head: XmlNode[],
  tag: "translation" | "transliteration",
  startByKey: Map<string, number | undefined>,
): InlineLayer[] {
  return findAll(head, tag).flatMap((layer) => {
    const lang = attr(layer, "lang") ?? "und";
    return findAll(childrenOf(layer), "text").flatMap((text) => {
      const key = attr(text, "for");
      const value = collapse(textOf(text)).trim();
      if (!key || !value || !startByKey.has(key)) return [];
      return [{ lang, start: startByKey.get(key), value }];
    });
  });
}

function groupLayers(
  layers: InlineLayer[],
  kind: "translation" | "pronunciation",
  synced: boolean,
): StructuredLyrics[] {
  const byLang = new Map<string, Line[]>();
  for (const { lang, start, value } of layers) {
    const lines = byLang.get(lang) ?? [];
    lines.push({ value, start });
    byLang.set(lang, lines);
  }
  return [...byLang].map(([lang, line]) => ({ kind, lang, synced, line }));
}

export function parseTtmlLyrics(
  xml: string,
  displayTitle?: string,
  displayArtist?: string,
): StructuredLyrics[] {
  let doc: XmlNode[];
  try {
    doc = parser.parse(xml) as XmlNode[];
  } catch {
    return [];
  }
  const tt = findAll(doc, "tt")[0];
  if (!tt) return [];
  const root = childrenOf(tt);
  const head = findAll(root, "head").flatMap(childrenOf);
  const agents = parseAgents(head);

  const parsed: ParsedLine[] = [];
  const translations: InlineLayer[] = [];
  const pronunciations: InlineLayer[] = [];
  for (const p of findAll(findAll(root, "body"), "p")) {
    const start = parseTtmlTime(attr(p, "begin"));
    const end = parseTtmlTime(attr(p, "end"));
    const agentId = attr(p, "agent");
    const builder: LineBuilder = {
      cues: [],
      text: "",
      background: [],
      translations: [],
      pronunciations: [],
    };
    walkLine(childrenOf(p), builder, builder.cues, start);
    translations.push(...builder.translations);
    pronunciations.push(...builder.pronunciations);

    const value = lineValue(builder.cues, builder.text);
    if (value) {
      parsed.push({
        line: { value, start: start ?? builder.cues[0]?.start },
        end,
        agentId:
          attr(p, "role") === BACKGROUND_ROLE
            ? backgroundAgentId(agents, agentId)
            : agentId,
        cues: builder.cues,
        key: attr(p, "key"),
      });
    }
    if (builder.background.length) {
      const bg = builder.background;
      parsed.push({
        line: { value: lineValue(bg, ""), start: bg[0].start },
        end: bg[bg.length - 1].end ?? end,
        agentId: backgroundAgentId(agents, agentId),
        cues: bg,
      });
    }
  }
  if (parsed.length === 0) return [];

  parsed.sort((a, b) => (a.line.start ?? 0) - (b.line.start ?? 0));
  const synced = parsed.some((p) => p.line.start != null);
  const cueLine: CueLine[] = [];
  parsed.forEach((p, index) => {
    if (!p.cues.length && !p.agentId) return;
    cueLine.push({
      index,
      start: p.line.start,
      end: p.end ?? parsed[index + 1]?.line.start,
      value: p.line.value,
      ...(p.agentId ? { agentId: p.agentId } : {}),
      ...(p.cues.length ? { cue: withOffsets(p.cues) } : {}),
    });
  });

  const startByKey = new Map<string, number | undefined>();
  for (const p of parsed) if (p.key) startByKey.set(p.key, p.line.start);
  translations.push(...headLayers(head, "translation", startByKey));
  pronunciations.push(...headLayers(head, "transliteration", startByKey));

  return [
    {
      kind: "main",
      lang: attr(tt, "lang") ?? "und",
      synced,
      line: parsed.map((p) => p.line),
      ...(cueLine.length ? { cueLine } : {}),
      ...(agents.length ? { agents } : {}),
      displayTitle,
      displayArtist,
    },
    ...groupLayers(translations, "translation", synced),
    ...groupLayers(pronunciations, "pronunciation", synced),
  ];
}
