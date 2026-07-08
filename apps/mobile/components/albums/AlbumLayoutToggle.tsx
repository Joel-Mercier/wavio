import LayoutGrid from "lucide-react-native/dist/esm/icons/layout-grid.mjs";
import List from "lucide-react-native/dist/esm/icons/list.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import type { AlbumScreenLayout } from "@/stores/app";

interface AlbumLayoutToggleProps {
  layout: AlbumScreenLayout;
  onPress: () => void;
}

export default function AlbumLayoutToggle({
  layout,
  onPress,
}: AlbumLayoutToggleProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  return (
    <FadeOutScaleDown testID="album-layout-toggle" onPress={onPress}>
      {layout === "list" ? (
        <LayoutGrid size={16} color={white} />
      ) : (
        <List size={16} color={white} />
      )}
    </FadeOutScaleDown>
  );
}
