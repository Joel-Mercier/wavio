import { useTranslation } from "react-i18next";
import ArtistCarouselRow from "@/components/artists/ArtistCarouselRow";
import { useHydratedArtists } from "@/hooks/audioMuse/useHydratedArtists";
import { useSimilarArtists } from "@/hooks/audioMuse/useSimilarArtists";

interface AudioMuseSimilarArtistsProps {
  artistId: string;
  artistName?: string;
}

// AudioMuse's sonic take on "similar", kept in its own component so the artist
// screen gains no data fetching of its own and every AudioMuse hook stays behind
// one mount point that disappears when the integration isn't configured.
export default function AudioMuseSimilarArtists({
  artistId,
  artistName,
}: AudioMuseSimilarArtistsProps) {
  const { t } = useTranslation();
  const { data } = useSimilarArtists({ artistId, artistName });
  const artists = useHydratedArtists(data);

  return (
    <ArtistCarouselRow
      title={t("app.artists.soundsLike")}
      subtitle={t("app.artists.poweredByAudioMuse")}
      artists={artists}
    />
  );
}
