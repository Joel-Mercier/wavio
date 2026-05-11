import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import LibraryRow from "@/components/libraries/LibraryRow";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useMusicFolders as useMusicFoldersQuery } from "@/hooks/openSubsonic/useBrowsing";
import type { MusicFolder } from "@/services/openSubsonic/types";
import {
  useCurrentAuthScope,
  useCurrentMusicFolderId,
  useMusicFoldersBase,
} from "@/stores/musicFolders";

const FOLDER_QUERY_PREFIXES = [
  "albumList2",
  "albumList",
  "starred2",
  "starred",
  "search3",
  "search2",
  "artists",
  "indexes",
  "randomSongs",
  "songsByGenre",
];

export default function LibrariesDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMusicFoldersQuery();
  const scope = useCurrentAuthScope();
  const currentFolderId = useCurrentMusicFolderId();
  const setCurrentFolder = useMusicFoldersBase((s) => s.setCurrentFolder);

  const folders = data?.musicFolders?.musicFolder ?? [];

  const select = (id: string | undefined) => {
    if (!scope) return;
    setCurrentFolder(scope, id);
    for (const prefix of FOLDER_QUERY_PREFIXES) {
      queryClient.invalidateQueries({ queryKey: [prefix] });
    }
    router.back();
  };

  return (
    <Box className="px-6 mt-6 pb-6 h-full">
      <HStack className="items-center mb-6" style={{ paddingTop: insets.top }}>
        <FadeOutScaleDown onPress={() => router.back()}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white ml-4" size="lg">
          {t("app.libraries.title")}
        </Heading>
      </HStack>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={folders}
          ListHeaderComponent={
            <LibraryRow
              label={t("app.libraries.allLibraries")}
              isSelected={currentFolderId === undefined}
              onPress={() => select(undefined)}
            />
          }
          renderItem={({
            item,
            index,
          }: {
            item: MusicFolder;
            index: number;
          }) => (
            <LibraryRow
              label={item.name ?? `Library ${item.id}`}
              isDefault={index === 0}
              isSelected={currentFolderId === String(item.id)}
              onPress={() => select(String(item.id))}
            />
          )}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
          }}
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
        />
      )}
    </Box>
  );
}
