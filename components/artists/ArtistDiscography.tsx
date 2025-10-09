import { Box } from "@/components/ui/box";
import { useArtist } from "@/hooks/openSubsonic/useBrowsing";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";

export default function ArtistDiscography() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { data, isLoading, error } = useArtist(id);
  return (
    <Box className="mt-6 pb-6 h-full">
      <HStack
        className="px-6 items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => router.back()}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white" size="xl">
          {name}
        </Heading>
        <Box className="w-6" />
      </HStack>
      <FlashList
        data={data?.artist?.album || loadingData(3)}
        renderItem={({ item, index }: { item: AlbumID3; index: number }) =>
          isLoading ? (
            <AlbumListItemSkeleton index={index} />
          ) : (
            <Box className="bg-black">
              <AlbumListItem album={item} index={index} />
            </Box>
          )
        }
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom: insets.bottom + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
