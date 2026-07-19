import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import LidarrCover from "@/components/downloaders/lidarr/LidarrCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { albumCoverUrl } from "@/services/lidarr/images";
import type { LidarrAlbum } from "@/services/lidarr/types";

export default function LidarrAlbumRow({ album }: { album: LidarrAlbum }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const year = album.releaseDate?.slice(0, 4);
  const subtitleParts = [
    album.artist?.artistName,
    album.albumType,
    year,
  ].filter(Boolean);

  const handlePress = () => {
    // Seed the detail query so the screen renders instantly without refetching.
    queryClient.setQueryData(["lidarr", "album", album.foreignAlbumId], album);
    router.navigate(`/downloaders/album/${album.foreignAlbumId}`);
  };

  return (
    <FadeOutScaleDown onPress={handlePress}>
      <HStack className="items-center gap-x-3 px-6 py-2">
        <LidarrCover url={albumCoverUrl(album)} size={56} variant="album" />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {album.title}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {subtitleParts.length > 0
              ? subtitleParts.join(" · ")
              : t("app.settings.downloaders.discovery.album")}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
