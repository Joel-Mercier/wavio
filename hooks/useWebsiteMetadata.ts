import { decode } from 'html-entities';
import { useEffect, useState } from "react";

function findOGTags(content: string, url: string) {
  const metaTagOGRegex = /<meta[^>]*(?:property=[ '"]*og:([^'"]*))?[^>]*(?:content=["]([^"]*)["])?[^>]*>/gi;
  const matches = content.match(metaTagOGRegex);
  const meta: Record<string, string> = {};

  if (matches) {
    const metaPropertyRegex = /<meta[^>]*property=[ "]*og:([^"]*)[^>]*>/i;
    const metaContentRegex = /<meta[^>]*content=[ "]([^"]*)[^>]*>/i;

    for (let i = matches.length; i--;) {
      let propertyMatch: RegExpExecArray | null;
      let contentMatch: RegExpExecArray | null;
      let metaName: string;
      let metaValue: string;

      try {
        propertyMatch = metaPropertyRegex.exec(matches[i]);
        contentMatch = metaContentRegex.exec(matches[i]);

        if (!propertyMatch || !contentMatch) {
          continue;
        }

        metaName = propertyMatch[1].trim();
        metaValue = contentMatch[1].trim();

        if (!metaName || !metaValue) {
          continue;
        }
      } catch (error) {
        if (__DEV__) {
          console.log('Error on ', matches[i]);
          console.log(error);
        }

        continue;
      }

      if (metaValue.length > 0) {
        if (metaValue[0] === '/') {
          if (metaValue.length <= 1 || metaValue[1] !== '/') {
            if (url[url.length - 1] === '/') {
              metaValue = url + metaValue.substring(1);
            } else {
              metaValue = url + metaValue;
            }
          } else {
            // handle protocol agnostic meta URLs
            if (url.indexOf('https://') === 0) {
              metaValue = `https:${metaValue}`;
            } else if (url.indexOf('http://') === 0) {
              metaValue = `http:${metaValue}`;
            }
          }
        }
      } else {
        continue;
      }

      meta[metaName] = decode(metaValue);
    }
  }

  return meta;
}

function findHTMLMetaTags(content: string, url: string) {
  const metaTagHTMLRegex = /<meta(?:[^>]*(?:name|itemprop)=[ '"]([^'"]*))?[^>]*(?:[^>]*content=["]([^"]*)["])?[^>]*>/gi;
  const matches = content.match(metaTagHTMLRegex);
  const meta: Record<string, string> = {};

  if (matches) {
    const metaPropertyRegex = /<meta[^>]*(?:name|itemprop)=[ "]([^"]*)[^>]*>/i;
    const metaContentRegex = /<meta[^>]*content=[ "]([^"]*)[^>]*>/i;

    for (let i = matches.length; i--;) {
      let propertyMatch: RegExpExecArray | null;
      let contentMatch: RegExpExecArray | null;
      let metaName: string;
      let metaValue: string;

      try {
        propertyMatch = metaPropertyRegex.exec(matches[i]);
        contentMatch = metaContentRegex.exec(matches[i]);

        if (!propertyMatch || !contentMatch) {
          continue;
        }

        metaName = propertyMatch[1].trim();
        metaValue = contentMatch[1].trim();

        if (!metaName || !metaValue) {
          continue;
        }
      } catch (error) {
        if (__DEV__) {
          console.log('Error on ', matches[i]);
          console.log(error);
        }

        continue;
      }

      if (metaValue.length > 0) {
        if (metaValue[0] === '/') {
          if (metaValue.length <= 1 || metaValue[1] !== '/') {
            if (url[url.length - 1] === '/') {
              metaValue = url + metaValue.substring(1);
            } else {
              metaValue = url + metaValue;
            }
          } else {
            // handle protocol agnostic meta URLs
            if (url.indexOf('https://') === 0) {
              metaValue = `https:${metaValue}`;
            } else if (url.indexOf('http://') === 0) {
              metaValue = `http:${metaValue}`;
            }
          }
        }
      } else {
        continue;
      }

      meta[metaName] = decode(metaValue);
    }

    if (!meta.title) {
      const titleRegex = /<title>([^>]*)<\/title>/i;
      const titleMatch = content.match(titleRegex);

      if (titleMatch) {
        meta.title = decode(titleMatch[1]);
      }
    }
  }

  return meta;
}

function parseMeta(html: string, url: string, options: { fallbackOnHTMLTags: boolean }) {
  let meta = findOGTags(html, url);
  if (options.fallbackOnHTMLTags) {
    try {
      meta = {
        ...findHTMLMetaTags(html, url),
        ...meta,
      };
    } catch (error) {
      if (__DEV__) {
        console.log('Error in fallback', error);
      }
    }
  }

  return meta;
}

const useWebsiteMetadata = (url?: string) => {
  const [meta, setMeta] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!url) return;
    const fetchImage = async () => {
      try {
        const response = await fetch(url, {
          method: "GET",
        });
        const data = await response.text();
        const parsedMeta = parseMeta(data, url, { fallbackOnHTMLTags: true });
        setMeta(parsedMeta)
      } catch (error) {
        console.error(error);
      }
    };
    fetchImage();
  }, [url]);

  return meta;
};

export default useWebsiteMetadata;