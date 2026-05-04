"use client";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { ImageBackground as ExpoImageBackground } from "expo-image";
import { cssInterop } from "nativewind";
import React from "react";

cssInterop(ExpoImageBackground, { className: "style" });

const imageBackgroundStyle = tva({});

type ImageBackgroundProps = React.ComponentProps<typeof ExpoImageBackground> & {
  className?: string;
};

function ImageBackground({ className, ...props }: ImageBackgroundProps) {
  return (
    <ExpoImageBackground
      {...props}
      className={imageBackgroundStyle({
        class: className,
      })}
    />
  );
}

ImageBackground.displayName = "ImageBackground";

export { ImageBackground };
