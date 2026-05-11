"use client";
import { createSwitch } from "@gluestack-ui/core/switch/creator";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";
import { tva, withStyleContext } from "@gluestack-ui/utils/nativewind-utils";
import React from "react";
import { Switch as RNSwitch, View } from "react-native";

const SwitchRoot = React.forwardRef<
  React.ComponentRef<typeof RNSwitch>,
  React.ComponentProps<typeof RNSwitch> & { wrapperClassName?: string }
>(function SwitchRoot({ wrapperClassName, ...props }, ref) {
  return (
    <View className={wrapperClassName}>
      <RNSwitch ref={ref} {...props} />
    </View>
  );
});

const UISwitch = createSwitch({
  Root: withStyleContext(SwitchRoot),
});

const switchStyle = tva({
  base: "data-[focus=true]:outline-0 data-[focus=true]:ring-2 data-[focus=true]:ring-indicator-primary web:cursor-pointer disabled:cursor-not-allowed data-[disabled=true]:opacity-40 data-[invalid=true]:border-destructive data-[invalid=true]:rounded-xl data-[invalid=true]:border-2",

  variants: {
    size: {
      sm: "scale-[0.75]",
      md: "",
      lg: "scale-[1.25]",
    },
  },
});

type ISwitchProps = Omit<React.ComponentProps<typeof UISwitch>, "wrapperClassName"> &
  VariantProps<typeof switchStyle>;
const Switch = React.forwardRef<
  React.ComponentRef<typeof UISwitch>,
  ISwitchProps
>(function Switch({ className, size = "md", ...props }, ref) {
  return (
    <UISwitch
      ref={ref}
      {...props}
      wrapperClassName={switchStyle({ size, class: className })}
    />
  );
});

Switch.displayName = "Switch";

export { Switch };
