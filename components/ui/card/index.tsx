import type { VariantProps } from "@gluestack-ui/nativewind-utils";
import React from "react";
import { View, type ViewProps } from "react-native";
import { cardStyle } from "./styles";

type ICardProps = ViewProps &
  VariantProps<typeof cardStyle> & { className?: string };

const Card = React.forwardRef<React.ElementRef<typeof View>, ICardProps>(
  ({ className, size = "md", variant = "elevated", ...props }, ref) => {
    return (
      <View
        className={cardStyle({ size, variant, class: className })}
        {...props}
        ref={ref}
      />
    );
  },
);

Card.displayName = "Card";

export { Card };
