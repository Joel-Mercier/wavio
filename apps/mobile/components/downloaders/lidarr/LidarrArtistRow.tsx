import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import LidarrCover from "@/components/downloaders/lidarr/LidarrCover";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { artistImageUrl } from "@/services/lidarr/images";
import type { LidarrArtist } from "@/services/lidarr/types";

export default function LidarrArtistRow({ artist }: { artist: LidarrArtist }) {
  const router = useRouter();
  const { t } = useTranslation();

  const handlePress = () => {
    router.navigate({
      pathname: "/downloaders/artist/[id]",
      params: {
        id: artist.foreignArtistId,
        name: artist.artistName,
      },
    });
  };

  return (
    <FadeOutScaleDown onPress={handlePress}>
      <HStack className="items-center gap-x-3 px-6 py-2">
        <LidarrCover url={artistImageUrl(artist)} size={56} variant="artist" />
        <VStack className="flex-1">
          <Heading
            className="text-white font-normal"
            size="sm"
            numberOfLines={1}
          >
            {artist.artistName}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {artist.disambiguation ||
              artist.artistType ||
              t("app.settings.downloaders.discovery.artist")}
          </Text>
        </VStack>
      </HStack>
    </FadeOutScaleDown>
  );
}
