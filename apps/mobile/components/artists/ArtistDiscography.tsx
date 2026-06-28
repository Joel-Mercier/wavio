import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box } from "@/components/ui/box";
import { useArtist } from "@/hooks/backend/useBrowsing";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import type { AlbumID3 } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import AlbumListItem from "../albums/AlbumListItem";
import AlbumListItemSkeleton from "../albums/AlbumListItemSkeleton";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";

export default function ArtistDiscography() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const floatingPlayerInset = useFloatingPlayerInset();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { data, isLoading, error } = useArtist(id);
  return (
    <Box className={cn("pb-6 h-full", isWideLayout ? "mb-6" : "mt-6")}>
      <HStack
        className="px-6 items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center truncate flex-1" size="lg">
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
          paddingBottom: insets.bottom + floatingPlayerInset,
        }}
        showsVerticalScrollIndicator={false}
      />
    </Box>
  );
}
