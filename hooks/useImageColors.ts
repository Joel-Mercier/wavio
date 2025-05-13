import { useEffect, useState } from "react"
import { type ImageColorsResult, getColors } from 'react-native-image-colors'

const useImageColors = (url: string) => {
  const [colors, setColors] = useState<ImageColorsResult | null>(null)

  useEffect(() => {
    getColors(url, {
      fallback: '#fff',
      cache: true,
      key: url,
    }).then(setColors)
  }, [url])

  return colors
}

export default useImageColors