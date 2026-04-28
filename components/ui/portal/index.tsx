"use client";
import { Overlay } from "@gluestack-ui/core/overlay/creator";
import { cssInterop } from "nativewind";
import React from "react";

cssInterop(Overlay, { className: "style" });

const Portal = React.forwardRef<
  React.ComponentRef<typeof Overlay>,
  React.ComponentProps<typeof Overlay>
>(function Portal({ ...props }, ref) {
  return <Overlay {...props} ref={ref} />;
});

Portal.displayName = "Portal";

export { Portal };
