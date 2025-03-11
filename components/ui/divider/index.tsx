"use client";
import type { VariantProps } from "@gluestack-ui/nativewind-utils";
import { tva } from "@gluestack-ui/nativewind-utils/tva";
import React from "react";
import { Platform, View } from "react-native";

const dividerStyle = tva({
  base: "bg-background-200",
  variants: {
    orientation: {
      vertical: "w-px h-full",
      horizontal: "h-px w-full",
    },
  },
});

type IUIDividerProps = React.ComponentPropsWithoutRef<typeof View> &
  VariantProps<typeof dividerStyle>;

const Divider = React.forwardRef<
  React.ElementRef<typeof View>,
  IUIDividerProps
>(({ className, orientation = "horizontal", ...props }, ref) => {
  return (
    <View
      ref={ref}
      {...props}
      aria-orientation={orientation}
      role={Platform.OS === "web" ? "separator" : undefined}
      className={dividerStyle({
        orientation,
        class: className,
      })}
    />
  );
});

Divider.displayName = "Divider";

export { Divider };
