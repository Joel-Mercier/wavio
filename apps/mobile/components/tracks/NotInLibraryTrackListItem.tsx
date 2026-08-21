import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useDownloaderSearch } from "@/hooks/useDownloaders";
import type { ExternalTrack } from "@/services/libraryMatch";
import { cn } from "@/utils/tailwind";

// A track a generated playlist names but the library doesn't hold. It gets its
// own component rather than a flag on TrackListItem for the same reason
// NotInLibraryArtistListItem does: none of that one's behaviour applies. There
// is nothing to play, star, queue, swipe or download — only a name.
//
// A configured downloader is the one place that name leads somewhere, so the row
// opens it pre-searched (asking which one when several are connected). Without
// any, there is nothing to offer and the row stays inert rather than pretending
// to be tappable.
function NotInLibraryTrackListItem({
  track,
  coverArtUrl,
  className,
}: {
  track: ExternalTrack;
  /** Cover Art Archive thumbnail, when the source supplied its coordinates. */
  coverArtUrl?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { downloaders, canSearch, searchFor } = useDownloaderSearch();

  const handlePress = () => {
    searchFor(`${track.artist} ${track.title}`);
  };

  const label = () => {
    if (!canSearch) return t("app.artists.notInLibrary");
    if (downloaders.length === 1) {
      return t("app.artists.notInLibraryFindIn", {
        name: downloaders[0].name,
      });
    }
    return t("app.artists.notInLibraryFindInDownloader");
  };

  return (
    <FadeOutScaleDown
      onPress={handlePress}
      disabled={!canSearch}
      className={cn("py-2", className)}
    >
      <HStack className="items-center flex-1">
        <ImageWithFallback
          source={coverArtUrl ? { uri: coverArtUrl } : undefined}
          className="w-16 h-16 rounded-md aspect-square opacity-60"
          alt="Track cover"
          fallback={
            <Box className="w-16 h-16 aspect-square rounded-md border border-dashed border-primary-300 bg-primary-800 items-center justify-center">
              <AudioLines size={24} color={white} />
            </Box>
          }
        />
        <VStack className="flex-1 ml-4">
          {/* Dimmed rather than white, so the row reads as "not yours" at a
              glance next to the tracks that are. */}
          <Heading
            className="text-primary-100 text-md font-normal mr-4"
            numberOfLines={1}
          >
            {track.title}
          </Heading>
          <Text numberOfLines={1} className="text-md text-primary-100">
            {track.artist} · {label()}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}

export default memo(NotInLibraryTrackListItem);
