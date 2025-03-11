import { isWeb } from "@gluestack-ui/nativewind-utils/IsWeb";
import { tva } from "@gluestack-ui/nativewind-utils/tva";

const gridBaseStyle = isWeb
  ? "grid grid-cols-12"
  : "box-border flex-row flex-wrap justify-start";
const gridItemBaseStyle = isWeb ? "w-auto col-span-1" : "";

export const gridStyle = tva({
  base: `w-full ${gridBaseStyle}`,
});

export const gridItemStyle = tva({
  base: `w-full ${gridItemBaseStyle}`,
});
