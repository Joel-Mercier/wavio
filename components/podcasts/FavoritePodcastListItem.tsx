import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Image } from "@/components/ui/image";
import type { FavoritePodcast } from "@/stores/podcasts";

interface FavoritePodcastListItemProps {
  podcast: FavoritePodcast;
}
export default function FavoritePodcastListItem({
  podcast,
}: FavoritePodcastListItemProps) {
  return (
    <FadeOutScaleDown
      href={{
        pathname: "/podcast-series/[id]",
        params: {
          id: podcast.uuid,
          uuid: podcast.uuid,
          name: podcast.name,
          genres: podcast.genres?.join(","),
          language: podcast.language,
          country: podcast.country,
          imageUrl: podcast.imageUrl,
          authorName: podcast.authorName,
          dateAdded: podcast.dateAdded,
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
