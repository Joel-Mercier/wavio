import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useDownloaderSearch } from "@/hooks/useDownloaders";
import type { ArtistID3 } from "@/services/openSubsonic/types";

// An artist a recommendation names but the library doesn't hold. It gets its
// own component rather than a flag on ArtistListItem because none of that one's
// behaviour applies: there is no detail screen to link to, no artwork to load,
// and no offline availability to check — only a name.
//
// A configured downloader is the one place that name leads somewhere, so the
// tile opens it pre-searched (asking which one when several are connected).
// Without any, there is nothing to offer and the tile stays inert rather than
// pretending to be tappable.
function NotInLibraryArtistListItem({ artist }: { artist: ArtistID3 }) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { downloaders, canSearch, searchFor } = useDownloaderSearch();

  const handlePress = () => {
    searchFor(artist.name);
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
      className="mr-6"
    >
      <VStack className="gap-y-2 w-32">
        <Box className="w-32 h-32 rounded-full aspect-square border border-dashed border-primary-300 bg-primary-800 items-center justify-center">
          <User size={48} color={white} />
        </Box>
        <VStack>
          <Heading size="sm" className="text-white" numberOfLines={1}>
            {artist.name}
          </Heading>
          <Text numberOfLines={2} className="text-md text-primary-100">
            {label()}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(NotInLibraryArtistListItem);
