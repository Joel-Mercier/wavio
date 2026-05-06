import { decode } from "html-entities";

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

export type Paragraph = InlineNode[];

const ANCHOR_RE = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const URL_RE = /(https?:\/\/[^\s<>()"']+[^\s<>().,!?;:'"])/gi;
const EMAIL_RE = /([\w.+-]+@[\w-]+\.[\w.-]+)/g;

function stripAndDecode(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Splits a plain (already tag-stripped) string into text/link nodes by
 * detecting bare URLs and email addresses.
 */
function autolinkText(value: string): InlineNode[] {
  if (!value) return [];
  const combined = new RegExp(`${URL_RE.source}|${EMAIL_RE.source}`, "gi");
  const nodes: InlineNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
  while ((match = combined.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const matched = match[0];
    const isEmail = matched.includes("@") && !matched.startsWith("http");
    nodes.push({
      type: "link",
      value: matched,
      href: isEmail ? `mailto:${matched}` : matched,
    });
    lastIndex = match.index + matched.length;
  }
  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }
  return nodes;
}

/**
 * Parses a rich-text string (HTML or plain text) into paragraphs of inline
 * nodes. Block-level tags become paragraph breaks, <br> becomes a line break,
 * <li> becomes a bulleted line, <a> tags and bare URLs/emails become links.
 */
export function parseRichText(input?: string | null): Paragraph[] {
  if (!input) return [];

  let text = input.replace(/\r\n?/g, "\n");
  text = text.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  text = text.replace(/<\s*hr\s*\/?\s*>/gi, "\n\n");
  text = text.replace(/<\/\s*li\s*>/gi, "\n");
  text = text.replace(/<\s*li[^>]*>/gi, "• ");
  text = text.replace(/<\/\s*(p|div|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, "\n\n");

  return text
    .split(/\n{2,}/)
    .map((para) => {
      const nodes: InlineNode[] = [];
      let lastIndex = 0;
      ANCHOR_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration
      while ((match = ANCHOR_RE.exec(para)) !== null) {
        if (match.index > lastIndex) {
          nodes.push(
            ...autolinkText(stripAndDecode(para.slice(lastIndex, match.index))),
          );
        }
        nodes.push({
          type: "link",
          value: stripAndDecode(match[2]),
          href: match[1],
        });
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < para.length) {
        nodes.push(...autolinkText(stripAndDecode(para.slice(lastIndex))));
      }
      return nodes.filter((n) => n.value.length > 0);
    })
    .filter((p) => p.length > 0);
}

/** Plain-text version, used for previews where line breaks aren't wanted. */
export function formatRichTextPlain(input?: string | null): string {
  return parseRichText(input)
    .map((para) => para.map((n) => n.value).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
