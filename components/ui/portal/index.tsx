"use client";
import { Overlay } from "@gluestack-ui/core/overlay/creator";
import React from "react";
import { withUniwind } from "uniwind";

const StyledOverlay = withUniwind(Overlay);

const Portal = React.forwardRef<
  React.ComponentRef<typeof Overlay>,
  React.ComponentProps<typeof Overlay>
>(function Portal({ ...props }, ref) {
  return <StyledOverlay {...props} ref={ref} />;
});

Portal.displayName = "Portal";

export { Portal };
