import { decode } from "html-entities";
import { useEffect, useState } from "react";

const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const LINK_TAG_REGEX = /<link\b[^>]*>/gi;
const ATTR_REGEX = /(\w[\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
const TITLE_REGEX = /<title[^>]*>([^<]*)<\/title>/i;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_REGEX.exec(tag)) !== null) {
    const [, name, dq, sq, uq] = match;
    attrs[name.toLowerCase()] = dq ?? sq ?? uq ?? "";
  }
  return attrs;
}

function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function findMetaTags(content: string, url: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const htmlMeta: Record<string, string> = {};

  const tags = content.match(META_TAG_REGEX);
  if (tags) {
    for (const tag of tags) {
      const attrs = parseAttrs(tag);
      const rawContent = attrs.content?.trim();
      if (!rawContent) continue;

      const value = decode(resolveUrl(rawContent, url));

      if (attrs.property?.startsWith("og:")) {
        const key = attrs.property.slice(3).trim();
        if (key) meta[key] = value;
      } else {
        const htmlKey = (attrs.name || attrs.itemprop)?.trim();
        if (htmlKey) htmlMeta[htmlKey] = value;
      }
    }
  }

  if (!htmlMeta.title) {
    const titleMatch = content.match(TITLE_REGEX);
    if (titleMatch) htmlMeta.title = decode(titleMatch[1].trim());
  }

  return { ...htmlMeta, ...meta };
}

function findIconLinks(content: string, url: string): string[] {
  const icons: { href: string; priority: number }[] = [];
  const tags = content.match(LINK_TAG_REGEX);
  if (!tags) return [];

  for (const tag of tags) {
    const attrs = parseAttrs(tag);
    const rel = attrs.rel?.toLowerCase();
    const href = attrs.href?.trim();
    if (!rel || !href) continue;
    if (!/(^|\s)(icon|apple-touch-icon|shortcut)(\s|$)/.test(rel)) continue;
    const priority = rel.includes("apple-touch-icon") ? 0 : 1;
    icons.push({ href: decode(resolveUrl(href, url)), priority });
  }

  return icons.sort((a, b) => a.priority - b.priority).map((i) => i.href);
}

async function isImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: BROWSER_HEADERS,
    });
    if (!response.ok) return false;
    const contentType = response.headers.get("content-type") || "";
    return contentType.toLowerCase().startsWith("image/");
  } catch {
    return false;
  }
}

async function pickFirstImage(candidates: string[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (await isImageUrl(candidate)) return candidate;
  }
  return null;
}

const useWebsiteMetadata = (url?: string) => {
  const [meta, setMeta] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const fetchMetadata = async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: BROWSER_HEADERS,
        });
        const data = await response.text();
        const parsedMeta = findMetaTags(data, url);
        const iconLinks = findIconLinks(data, url);

        const rawCandidates = [
          parsedMeta.image,
          parsedMeta["twitter:image"],
          parsedMeta["twitter:image:src"],
          parsedMeta["msapplication-tileimage"],
          ...iconLinks,
        ].filter(Boolean) as string[];

        const candidates = rawCandidates.flatMap((c) =>
          c.includes("/wp-content/thumbnails/")
            ? [c, c.replace("/wp-content/thumbnails/", "/wp-content/")]
            : [c],
        );

        const validImage = await pickFirstImage(candidates);
        if (validImage) {
          parsedMeta.image = validImage;
          parsedMeta["twitter:image"] = validImage;
        } else {
          delete parsedMeta.image;
          delete parsedMeta["twitter:image"];
        }

        // if (__DEV__) {
        //   console.log("[useWebsiteMetadata]", url, {
        //     status: response.status,
        //     candidates,
        //     picked: validImage,
        //   });
        // }
        if (!cancelled) setMeta(parsedMeta);
      } catch (error) {
        if (__DEV__) console.error("[useWebsiteMetadata]", url, error);
      }
    };
    fetchMetadata();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return meta;
};

export default useWebsiteMetadata;
