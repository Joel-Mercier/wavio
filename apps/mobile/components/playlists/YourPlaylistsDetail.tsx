import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box } from "@/components/ui/box";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import type { Playlist } from "@/services/openSubsonic/types";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { shuffleWithSeed } from "@/utils/shuffle";
import EmptyDisplay from "../EmptyDisplay";
import ErrorDisplay from "../ErrorDisplay";
import FadeOutScaleDown from "../FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";
import { Heading } from "../ui/heading";
import { HStack } from "../ui/hstack";
import PlaylistListItem from "./PlaylistListItem";
import PlaylistListItemSkeleton from "./PlaylistListItemSkeleton";

export default function YourPlaylistsDetail() {
  const { t } = useTranslation();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [seed] = useState(() => Date.now());
  const { data, isLoading, error } = usePlaylists({});
  const playlists = useMemo<Playlist[]>(() => {
    const all = data?.playlists?.playlist ?? [];
    return shuffleWithSeed(all, seed);
  }, [data, seed]);
  return (
    <Box className="mt-6 pb-6 h-full">
      <HStack
        className="px-6 items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center truncate flex-1" size="lg">
          {t("app.home.yourPlaylists")}
        </Heading>
        <Box className="w-6" />
      </HStack>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={isLoading ? loadingData(12) : playlists}
          renderItem={({ item, index }: { item: Playlist; index: number }) =>
            isLoading ? (
              <PlaylistListItemSkeleton index={index} />
            ) : (
              <Box className="bg-black">
                <PlaylistListItem
                  playlist={item}
                  index={index}
                  layout="vertical"
                />
              </Box>
            )
          }
          ListEmptyComponent={() => <EmptyDisplay />}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Box>
  );
}
