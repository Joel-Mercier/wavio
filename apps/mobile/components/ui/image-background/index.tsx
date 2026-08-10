"use client";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { ImageBackground as ExpoImageBackground } from "expo-image";
import type React from "react";
import { withUniwind } from "uniwind";
import { withServerHeaders } from "@/services/serverHeaders";

const StyledExpoImageBackground = withUniwind(ExpoImageBackground);

const imageBackgroundStyle = tva({});

type ImageBackgroundProps = React.ComponentProps<typeof ExpoImageBackground> & {
  className?: string;
};

function ImageBackground({ className, ...props }: ImageBackgroundProps) {
  return (
    <StyledExpoImageBackground
      {...props}
      // See components/ui/image: proxy-fronted servers need their headers on
      // artwork requests too.
      source={withServerHeaders(props.source)}
      className={imageBackgroundStyle({
        class: className,
      })}
    />
  );
}

ImageBackground.displayName = "ImageBackground";

export { ImageBackground };
