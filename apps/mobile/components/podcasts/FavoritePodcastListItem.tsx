import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import type { FavoritePodcast } from "@/stores/podcasts";
import { artworkUrl } from "@/utils/artwork";

interface FavoritePodcastListItemProps {
  podcast: FavoritePodcast;
}
export default function FavoritePodcastListItem({
  podcast,
}: FavoritePodcastListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
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
        <ImageWithFallback
          source={{ uri: image }}
          className="aspect-square"
          alt={podcast.name}
          fallback={
            <Box className="aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Podcast size={24} color={white} />
            </Box>
          }
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
      <ImageWithFallback
        source={{ uri: podcast.imageUrl }}
        className="aspect-square"
        alt={podcast.name}
        fallback={
          <Box className="aspect-square rounded-md bg-primary-600 items-center justify-center">
            <Podcast size={24} color={white} />
          </Box>
        }
      />
    </FadeOutScaleDown>
  );
}
