import { useEffect, useState } from "react";
import { getColors, type ImageColorsResult } from "react-native-image-colors";
import { requestHeadersForUrl } from "@/services/serverHeaders";

const extract = (url: string, key: string) =>
  getColors(url, {
    fallback: "#000",
    cache: true,
    key,
    // Without these the extraction 403s behind an authenticating proxy and
    // every screen silently falls back to the default tint.
    headers: requestHeadersForUrl(url),
  });

// The native side fetches with Android's HttpURLConnection, which won't follow a
// redirect across schemes, so an `http://` feed image that 301s to https hands
// it an HTML body. RN's fetch (OkHttp) does follow it, so resolve the final
// address and retry there. Only after a failure: working images pay nothing.
export async function loadImageColors(url: string): Promise<ImageColorsResult> {
  try {
    return await extract(url, url);
  } catch (error) {
    if (!/^http:\/\//i.test(url)) throw error;
    const response = await fetch(url, {
      method: "HEAD",
      headers: requestHeadersForUrl(url),
    }).catch(() => null);
    const resolved = response?.url;
    if (!resolved || resolved === url) throw error;
    return extract(resolved, url);
  }
}

const useImageColors = (url?: string) => {
  const [colors, setColors] = useState<ImageColorsResult | null>(null);

  useEffect(() => {
    if (!url) {
      setColors(null);
      return;
    }
    let cancelled = false;
    loadImageColors(url)
      .then((result) => {
        if (!cancelled) setColors(result);
      })
      .catch((error) => {
        // A failure here is non-fatal — callers fall back to a default tint —
        // but silently discarding it leaves no way to tell an unsupported image
        // from a missing file or an unreadable path, so surface it in dev.
        if (__DEV__) {
          console.log(`[imageColors] failed for ${url}: ${String(error)}`);
        }
        if (!cancelled) setColors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return colors;
};

export default useImageColors;
