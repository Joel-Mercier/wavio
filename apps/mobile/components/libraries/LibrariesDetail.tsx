import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryRow from "@/components/libraries/LibraryRow";
import LibraryListItemSkeleton from "@/components/library/LibraryListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { useMusicFolders as useMusicFoldersQuery } from "@/hooks/backend/useBrowsing";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { MusicFolder } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import { useAuthBase } from "@/stores/auth";
import {
  useCurrentAuthScope,
  useCurrentMusicFolderId,
  useMusicFoldersBase,
} from "@/stores/musicFolders";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

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
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMusicFoldersQuery();
  const scope = useCurrentAuthScope();
  const currentFolderId = useCurrentMusicFolderId();
  const setCurrentFolder = useMusicFoldersBase((s) => s.setCurrentFolder);
  const isJellyfin = useAuthBase((s) => s.serverType === "jellyfin");

  const folders = data?.musicFolders?.musicFolder ?? [];

  const select = (id: string | undefined) => {
    if (!scope) return;
    setCurrentFolder(scope, id);
    for (const prefix of FOLDER_QUERY_PREFIXES) {
      queryClient.invalidateQueries({ queryKey: [prefix] });
    }
    goBackOrHome(router);
  };

  return (
    <Box className={cn("px-6 pb-6 h-full", isWideLayout ? "mb-6" : "mt-6")}>
      <HStack
        className="items-center justify-between mb-6"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center flex-1" size="lg">
          {t("app.libraries.title")}
        </Heading>
        <Box className="w-6" />
      </HStack>
      {error && <ErrorDisplay error={error} />}
      {!error && (
        <FlashList
          data={
            isLoading ? (loadingData(6) as unknown as MusicFolder[]) : folders
          }
          ListHeaderComponent={
            isLoading || isJellyfin ? null : (
              <LibraryRow
                label={t("app.libraries.allLibraries")}
                isSelected={currentFolderId === undefined}
                onPress={() => select(undefined)}
              />
            )
          }
          renderItem={({
            item,
            index,
          }: {
            item: MusicFolder;
            index: number;
          }) =>
            isLoading ? (
              <LibraryListItemSkeleton layout="list" index={index} />
            ) : (
              <LibraryRow
                label={item.name ?? `Library ${item.id}`}
                isDefault={index === 0}
                isSelected={currentFolderId === String(item.id)}
                onPress={() => select(String(item.id))}
              />
            )
          }
          keyExtractor={(item, index) =>
            isLoading ? `skeleton-${index}` : String(item.id)
          }
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
          ListEmptyComponent={() => (isLoading ? null : <EmptyDisplay />)}
        />
      )}
    </Box>
  );
}
