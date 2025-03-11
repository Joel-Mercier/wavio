import { isWeb } from "@gluestack-ui/nativewind-utils/IsWeb";
import { tva } from "@gluestack-ui/nativewind-utils/tva";

const baseStyle = isWeb ? "flex flex-col relative z-0" : "";

export const centerStyle = tva({
  base: `justify-center items-center ${baseStyle}`,
});
