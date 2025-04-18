import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { ArtistID3 } from "@/services/openSubsonic/types";
import { User } from "lucide-react-native";

interface ArtistListItemProps {
  artist: ArtistID3;
}

export default function ArtistListItem({ artist }: ArtistListItemProps) {
  const cover = useGetCoverArt(
    artist.coverArt,
    { size: 200 },
    !!artist.coverArt,
  );
  return (
    <FadeOutScaleDown href={`/artists/${artist.id}`} className="mr-6">
      <VStack className="gap-y-2 w-32">
        {cover.data ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${cover.data}` }}
            className="w-32 h-32 rounded-full aspect-square"
            alt="Artist cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-full bg-primary-600 items-center justify-center">
            <User size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}
        <Heading size="sm" className="text-white" numberOfLines={1}>
          {artist.name}
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          Artist
        </Text>
      </VStack>
    </FadeOutScaleDown>
  );
}
