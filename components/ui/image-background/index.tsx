"use client";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import React from "react";
import { ImageBackground as RNImageBackground } from "react-native";

const imageBackgroundStyle = tva({});

const ImageBackground = React.forwardRef<
  React.ComponentRef<typeof RNImageBackground>,
  React.ComponentProps<typeof RNImageBackground>
>(function ImageBackground({ className, ...props }, ref) {
  return (
    <RNImageBackground
      className={imageBackgroundStyle({
        class: className,
      })}
      {...props}
      ref={ref}
    />
  );
});

ImageBackground.displayName = "ImageBackground";

export { ImageBackground };
