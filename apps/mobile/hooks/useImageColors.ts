import { useEffect, useState } from "react";
import { getColors, type ImageColorsResult } from "react-native-image-colors";
import { requestHeadersForUrl } from "@/services/serverHeaders";

const useImageColors = (url?: string) => {
  const [colors, setColors] = useState<ImageColorsResult | null>(null);

  useEffect(() => {
    if (!url) {
      setColors(null);
      return;
    }
    let cancelled = false;
    getColors(url, {
      fallback: "#000",
      cache: true,
      key: url,
      // Without these the extraction 403s behind an authenticating proxy and
      // every screen silently falls back to the default tint.
      headers: requestHeadersForUrl(url),
    })
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
