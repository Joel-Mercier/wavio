import { useEffect, useState } from "react";
import { getColors, type ImageColorsResult } from "react-native-image-colors";

const useImageColors = (url?: string) => {
  const [colors, setColors] = useState<ImageColorsResult | null>(null);

  useEffect(() => {
    if (!url) {
      setColors(null);
      return;
    }
    let cancelled = false;
    getColors(url, {
      fallback: "#fff",
      cache: true,
      key: url,
    })
      .then((result) => {
        if (!cancelled) setColors(result);
      })
      .catch(() => {
        if (!cancelled) setColors(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return colors;
};

export default useImageColors;
