import RNCMaskedView from "@react-native-masked-view/masked-view";
import type React from "react";
import type { ViewProps } from "react-native";

type MaskedViewProps = ViewProps & {
  maskElement: React.ReactElement;
  androidRenderingMode?: "software" | "hardware";
};

// The package types derive the component from `NativeMethods`, which React
// Native's strict TypeScript API no longer exports, so it stops being a valid
// JSX element type.
const MaskedView =
  RNCMaskedView as unknown as React.ComponentType<MaskedViewProps>;

export { MaskedView };
