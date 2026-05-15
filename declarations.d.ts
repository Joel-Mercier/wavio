/// <reference types="uniwind/types" />

declare module "*.svg" {
  import type React from "react";
  import type { SvgProps } from "react-native-svg";

  const content: React.FC<SvgProps>;
  export default content;
}

declare module "lucide-react-native/dist/esm/icons/*.mjs" {
  import type * as React from "react";
  import type { SvgProps } from "react-native-svg";

  interface LucideProps extends SvgProps {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  const Icon: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<LucideProps> & React.RefAttributes<unknown>
  >;
  export default Icon;
}
