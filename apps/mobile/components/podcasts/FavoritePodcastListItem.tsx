import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Image } from "@/components/ui/image";
import type { FavoritePodcast } from "@/stores/podcasts";
import { artworkUrl } from "@/utils/artwork";

interface FavoritePodcastListItemProps {
  podcast: FavoritePodcast;
}
export default function FavoritePodcastListItem({
  podcast,
}: FavoritePodcastListItemProps) {
  // Self-hosted (server/local) favorites open the channel screen and resolve
  // their art from the feed image or the Subsonic cover-art id; Taddy favorites
  // open the series screen with their direct image url.
  if (podcast.source === "server") {
    const image =
      podcast.imageUrl ||
      (podcast.coverArt ? artworkUrl(podcast.coverArt) : undefined);
    return (
      <FadeOutScaleDown
        href={{
          pathname: "/podcast-channels/[id]",
          params: {
            id: podcast.uuid,
            title: podcast.name,
            imageUrl: image,
            coverArt: podcast.coverArt,
            url: podcast.url,
          },
        }}
        className="rounded-lg"
      >
        <Image
          source={{ uri: image }}
          className="aspect-square"
          alt={podcast.name}
        />
      </FadeOutScaleDown>
    );
  }
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
