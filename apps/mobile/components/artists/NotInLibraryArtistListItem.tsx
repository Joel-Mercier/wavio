import { useRouter } from "expo-router";
import User from "lucide-react-native/dist/esm/icons/user.mjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import useLidarr from "@/stores/lidarr";

// An artist a recommendation names but the library doesn't hold. It gets its
// own component rather than a flag on ArtistListItem because none of that one's
// behaviour applies: there is no detail screen to link to, no artwork to load,
// and no offline availability to check — only a name.
//
// Lidarr is the one place that name leads somewhere, so with it connected the
// tile opens discovery pre-searched. Without it there is nothing to offer, and
// the tile stays inert rather than pretending to be tappable.
function NotInLibraryArtistListItem({ artist }: { artist: ArtistID3 }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const isLidarrConnected = useLidarr((store) => store.isConnected);

  const handlePress = () => {
    router.navigate({
      pathname: "/downloaders/discovery",
      params: { q: artist.name },
    });
  };

  return (
    <FadeOutScaleDown
      onPress={handlePress}
      disabled={!isLidarrConnected}
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
            {isLidarrConnected
              ? t("app.artists.notInLibraryAddWithLidarr")
              : t("app.artists.notInLibrary")}
          </Text>
        </VStack>
      </VStack>
    </FadeOutScaleDown>
  );
}

export default memo(NotInLibraryArtistListItem);
