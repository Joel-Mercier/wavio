import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Image } from "@/components/ui/image";
import type { FavoritePodcast } from "@/stores/podcasts";

interface FavoritePodcastListItemProps {
  podcast: FavoritePodcast;
}
export default function FavoritePodcastListItem({
  podcast,
}: FavoritePodcastListItemProps) {
  console.log(podcast);
  return (
    <FadeOutScaleDown
      href={{
        pathname: `/(app)/(tabs)/(home)/podcast-series/${podcast.uuid}`,
        params: {
          ...podcast,
          genres: podcast.genres?.join(","),
        },
      }}
      className="rounded-lg"
    >
      <Image
        source={{ uri: podcast.imageUrl }}
        className="aspect-square"
        alt={podcast.name}
      />
    </FadeOutScaleDown>
  );
}
