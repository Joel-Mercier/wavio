import { useEffect, useState } from "react";
import { getColors, type ImageColorsResult } from "react-native-image-colors";

const useImageColors = (url?: string) => {
  const [colors, setColors] = useState<ImageColorsResult | null>(null);

  useEffect(() => {
    if (!url) return;
    getColors(url, {
      fallback: "#fff",
      cache: true,
      key: url,
    }).then(setColors);
  }, [url]);

  return colors;
};

export default useImageColors;
