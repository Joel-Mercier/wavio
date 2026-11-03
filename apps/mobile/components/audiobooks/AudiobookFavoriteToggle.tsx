import Heart from "lucide-react-native/icons/heart";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import useAudiobookshelf, { type AbsFavorite } from "@/stores/audiobookshelf";

export default function AudiobookFavoriteToggle({
  favorite,
  size = 24,
}: {
  favorite: Omit<AbsFavorite, "addedAt">;
  size?: number;
}) {
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const isFavorite = useAudiobookshelf((s) =>
    s.favorites.some((f) => f.kind === favorite.kind && f.id === favorite.id),
  );
  const toggleFavorite = useAudiobookshelf((s) => s.toggleFavorite);
  return (
    <FadeOutScaleDown onPress={() => toggleFavorite(favorite)}>
      <Heart
        size={size}
        color={isFavorite ? emerald : white}
        fill={isFavorite ? emerald : "transparent"}
      />
    </FadeOutScaleDown>
  );
}
