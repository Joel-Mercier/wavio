"use client";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { ImageBackground as ExpoImageBackground } from "expo-image";
import React from "react";
import { withUniwind } from "uniwind";

const StyledExpoImageBackground = withUniwind(ExpoImageBackground);

const imageBackgroundStyle = tva({});

type ImageBackgroundProps = React.ComponentProps<typeof ExpoImageBackground> & {
  className?: string;
};

function ImageBackground({ className, ...props }: ImageBackgroundProps) {
  return (
    <StyledExpoImageBackground
      {...props}
      className={imageBackgroundStyle({
        class: className,
      })}
    />
  );
}

ImageBackground.displayName = "ImageBackground";

export { ImageBackground };
