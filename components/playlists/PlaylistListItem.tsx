import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Playlist } from "@/services/openSubsonic/types";
import { artworkUrl } from "@/utils/artwork";

interface PlaylistListItemProps {
  playlist: Playlist;
}

export default function PlaylistListItem({ playlist }: PlaylistListItemProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  return (
    <FadeOutScaleDown href={`/playlists/${playlist.id}`} className="mr-6">
      <VStack className="gap-y-2 w-32">
        {playlist.coverArt ? (
          <Image
            source={{ uri: artworkUrl(playlist.coverArt) }}
            className="w-32 h-32 rounded-md"
            alt="Playlist cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <ListMusic size={48} color={white} />
          </Box>
        )}

        <Heading size="sm" className="text-white" numberOfLines={1}>
          {playlist.name}
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          {t("app.shared.playlist_one")}
        </Text>
      </VStack>
    </FadeOutScaleDown>
  );
}
