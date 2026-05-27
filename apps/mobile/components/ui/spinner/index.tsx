"use client";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import React from "react";
import { ActivityIndicator } from "react-native";
import { withUniwind } from "uniwind";

const StyledActivityIndicator = withUniwind(ActivityIndicator);
const spinnerStyle = tva({});

const Spinner = React.forwardRef<
  React.ComponentRef<typeof ActivityIndicator>,
  React.ComponentProps<typeof ActivityIndicator>
>(function Spinner(
  {
    className,
    color,
    focusable = false,
    "aria-label": ariaLabel = "loading",
    ...props
  },
  ref,
) {
  return (
    <StyledActivityIndicator
      ref={ref}
      focusable={focusable}
      aria-label={ariaLabel}
      {...props}
      color={color}
      className={spinnerStyle({ class: className })}
    />
  );
});

Spinner.displayName = "Spinner";

export { Spinner };
