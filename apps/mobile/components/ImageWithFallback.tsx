import {
  type ComponentProps,
  type ComponentRef,
  forwardRef,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { Image } from "@/components/ui/image";
import { sourceUri } from "@/utils/imageRecyclingKey";

type ImageProps = ComponentProps<typeof Image>;

interface ImageWithFallbackProps extends ImageProps {
  // Rendered instead of the image when there's no source URI or the image
  // fails to load (e.g. offline with uncached art, or missing cover art).
  fallback: ReactNode;
}

// Wraps the shared expo-image based Image with an onError fallback. Unlike a
// background-layer overlay, the fallback only renders when the image is absent
// or errors — so it never shows through transparent regions of a successfully
// loaded image.
const ImageWithFallback = forwardRef<
  ComponentRef<typeof Image>,
  ImageWithFallbackProps
>(function ImageWithFallback({ fallback, onError, ...props }, ref) {
  const uri = sourceUri(props.source);
  const [errored, setErrored] = useState(false);

  // Reset on source change so recycled list rows don't keep a previous
  // item's error state.
  useEffect(() => {
    setErrored(false);
  }, [uri]);

  if (!uri || errored) {
    return <>{fallback}</>;
  }

  return (
    <Image
      {...props}
      ref={ref}
      onError={(event) => {
        setErrored(true);
        onError?.(event);
      }}
    />
  );
});

ImageWithFallback.displayName = "ImageWithFallback";

export default ImageWithFallback;
