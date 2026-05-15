import { createImage } from "@gluestack-ui/core/image/creator";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { Image as ExpoImage } from "expo-image";
import React from "react";
import { Platform } from "react-native";
import { withUniwind } from "uniwind";

const StyledExpoImage = withUniwind(ExpoImage);

const imageStyle = tva({
  base: "max-w-full",
  variants: {
    size: {
      "2xs": "h-6 w-6",
      xs: "h-10 w-10",
      sm: "h-16 w-16",
      md: "h-20 w-20",
      lg: "h-24 w-24",
      xl: "h-32 w-32",
      "2xl": "h-64 w-64",
      full: "h-full w-full",
      none: "",
    },
  },
});

const UIImage = createImage({ Root: StyledExpoImage });

type ImageProps = VariantProps<typeof imageStyle> &
  React.ComponentProps<typeof UIImage>;
const Image = React.forwardRef<
  React.ComponentRef<typeof UIImage>,
  ImageProps & { className?: string }
>(function Image({ size = "md", className, ...props }, ref) {
  return (
    <UIImage
      cachePolicy="memory-disk"
      {...props}
      className={imageStyle({ size, class: className })}
      ref={ref}
      style={[
        props.style,
        // @ts-expect-error : web only
        Platform.OS === "web"
          ? { height: "revert-layer", width: "revert-layer" }
          : null,
      ]}
    />
  );
});

Image.displayName = "Image";

export { Image };
