import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { Playlist } from "@/services/openSubsonic/types";
import { ListMusic } from "lucide-react-native";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { VStack } from "../ui/vstack";

interface PlaylistListItemProps {
  playlist: Playlist;
}

export default function PlaylistListItem({ playlist }: PlaylistListItemProps) {
  const cover = useGetCoverArt(
    playlist.coverArt,
    { size: 200 },
    !!playlist.coverArt,
  );

  return (
    <FadeOutScaleDown href={`/playlists/${playlist.id}`} className="mr-6">
      <VStack className="gap-y-2 w-32">
        {cover.data ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
            className="w-32 h-32 rounded-md"
            alt="Playlist cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <ListMusic size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}

        <Heading size="sm" className="text-white" numberOfLines={1}>
          {playlist.name}
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          Playlist
        </Text>
      </VStack>
    </FadeOutScaleDown>
  );
}
