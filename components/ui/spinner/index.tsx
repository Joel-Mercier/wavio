"use client";
import { tva } from "@gluestack-ui/nativewind-utils/tva";
import { cssInterop } from "nativewind";
import React from "react";
import { ActivityIndicator } from "react-native";

cssInterop(ActivityIndicator, {
  className: { target: "style", nativeStyleToProp: { color: true } },
});

const spinnerStyle = tva({});

const Spinner = React.forwardRef<
  React.ElementRef<typeof ActivityIndicator>,
  React.ComponentProps<typeof ActivityIndicator>
>(
  (
    {
      className,
      color,
      focusable = false,
      "aria-label": ariaLabel = "loading",
      ...props
    },
    ref,
  ) => {
    return (
      <ActivityIndicator
        ref={ref}
        focusable={focusable}
        aria-label={ariaLabel}
        {...props}
        color={color}
        className={spinnerStyle({ class: className })}
      />
    );
  },
);

Spinner.displayName = "Spinner";

export { Spinner };
