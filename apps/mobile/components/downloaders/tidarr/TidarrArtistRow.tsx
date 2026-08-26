import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { memo } from "react";
import { Uniwind } from "uniwind";
import DownloaderCover from "@/components/downloaders/DownloaderCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { tidalPictureUrl } from "@/services/tidarr/images";
import type { TidalArtist } from "@/services/tidarr/types";

function TidarrArtistRow({ artist }: { artist: TidalArtist }) {
  const router = useRouter();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];

  return (
    <FadeOutScaleDown
      onPress={() => router.navigate(`/downloaders/tidarr/artist/${artist.id}`)}
    >
      <HStack className="items-center gap-x-3 py-3">
        <DownloaderCover
          url={tidalPictureUrl(artist.picture)}
          size={48}
          variant="artist"
        />
        <Heading
          className="text-white font-normal flex-1"
          size="sm"
          numberOfLines={1}
        >
          {artist.name}
        </Heading>
        <ChevronRight size={20} color={gray200} />
      </HStack>
    </FadeOutScaleDown>
  );
}

// Rows re-render on every keystroke in the search field otherwise: the
// query state lives on the screen above them.
export default memo(TidarrArtistRow);
