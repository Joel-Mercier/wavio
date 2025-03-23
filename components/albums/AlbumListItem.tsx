import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { Link } from "expo-router";
import { Disc3 } from "lucide-react-native";

interface AlbumListItemProps {
  album: AlbumID3;
}

export default function AlbumListItem({ album }: AlbumListItemProps) {
  const cover = useGetCoverArt(album.coverArt, { size: 100 });
  return (
    <Link href={`/albums/${album.id}`} className="mr-6">
      <VStack className="gap-y-2 w-32">
        {cover.data ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
            className="w-32 h-32 rounded-md aspect-square"
            alt="Album cover"
          />
        ) : (
          <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
            <Disc3 size={48} color={themeConfig.theme.colors.white} />
          </Box>
        )}

        <Heading size="sm" className="text-white" numberOfLines={1}>
          {album.name}
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          {album.artist}
        </Text>
      </VStack>
    </Link>
  );
}
