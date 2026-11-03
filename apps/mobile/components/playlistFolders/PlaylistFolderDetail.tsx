import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { LegendList } from "@legendapp/list/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Pencil from "lucide-react-native/icons/pencil";
import X from "lucide-react-native/icons/x";
import { type ComponentProps, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import LibraryListItem from "@/components/library/LibraryListItem";
import LibraryListItemSkeleton from "@/components/library/LibraryListItemSkeleton";
import ConfirmActionDialog from "@/components/settings/ConfirmActionDialog";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import { useDownloadedCollections } from "@/hooks/offline";
import { useAlbumScreenLayout } from "@/hooks/useAlbumScreenLayout";
import { useIsOnline } from "@/hooks/useIsOnline";
import { usePlaylistFolderOptions } from "@/hooks/usePlaylistFolderOptions";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Playlist } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import usePlaylistsStore, {
  type PlaylistFolderAssignmentUpdates,
} from "@/stores/playlists";
import { gridColumnCount } from "@/utils/grid";
import {
  availableLibrarySortFields,
  DEFAULT_LIBRARY_SORT,
  type LibrarySortEntry,
  type LibrarySortField,
  librarySortSpecs,
} from "@/utils/librarySort";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  folderAssignmentFor,
  groupPlaylistsIntoFolders,
  type PlaylistFolderMember,
} from "@/utils/playlistFolders";
import { randomSeed } from "@/utils/shuffle";
import { effectiveSort, sortItems } from "@/utils/sort";

type LibraryItem = ComponentProps<typeof LibraryListItem>["item"];

export default function PlaylistFolderDetail() {
  const [white, gray200, red500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-200",
    "--color-red-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const screenBottomPadding = useScreenBottomPadding();
  const { key: paramKey } = useLocalSearchParams<{ key: string }>();
  const isOnline = useIsOnline();
  const downloadedCollections = useDownloadedCollections();
  const sort = useApp((store) => store.librarySort);
  const [shuffleSeed] = useState(randomSeed);
  // Same layout as the library the folder was opened from.
  const { layout } = useAlbumScreenLayout("library-index");
  const options = usePlaylistFolderOptions();
  const renamedTo = usePlaylistsStore(
    (store) => store.playlistFolderRenames[paramKey],
  );
  const deletePlaylistFolder = usePlaylistsStore(
    (store) => store.deletePlaylistFolder,
  );
  const { data, isLoading, error } = usePlaylists({});
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const gridColumns =
    layout === "grid"
      ? gridColumnCount(width, {
          minItemWidth: 160,
          minColumns: 3,
          maxColumns: 5,
        })
      : 1;

  const playlists = useMemo(() => {
    const listed = data?.playlists?.playlist ?? [];
    if (isOnline) return listed;
    // Offline the cached listing can miss playlists that are still downloaded,
    // which the library lists anyway.
    const ids = new Set(listed.map((playlist) => playlist.id));
    const offline = downloadedCollections
      .filter((c) => c.kind === "playlist" && !ids.has(c.id))
      .map(
        (c) =>
          ({
            id: c.id,
            name: c.name,
            songCount: c.songCount,
            coverArt: c.coverArt,
            owner: c.owner,
            created: c.savedAt,
          }) as unknown as Playlist,
      );
    return [...listed, ...offline];
  }, [data, isOnline, downloadedCollections]);

  const { folders } = groupPlaylistsIntoFolders(playlists, options);
  // A rename from the edit screen changes the key this screen was opened with.
  const folder =
    folders.find((candidate) => candidate.key === paramKey) ??
    (renamedTo
      ? folders.find((candidate) => candidate.key === renamedTo)
      : undefined);

  // Follows the library's sort, as far as playlists can: a field only the
  // library's albums or artists carry falls back to the default here.
  const members = useMemo(() => {
    const entries = (folder?.members ?? []).map((member) => ({
      bucket: "playlists" as const,
      row: {
        id: member.playlist.id,
        name: member.title,
        created: member.playlist.created,
        songCount: member.playlist.songCount,
        duration: member.playlist.duration,
      },
      member,
    }));
    const specs = librarySortSpecs(shuffleSeed);
    const activeSort = effectiveSort(
      sort,
      availableLibrarySortFields(entries, specs),
      DEFAULT_LIBRARY_SORT,
    );
    return sortItems<
      LibrarySortEntry & { member: PlaylistFolderMember<Playlist> },
      LibrarySortField
    >(entries, activeSort, specs).map((entry) => entry.member);
  }, [folder, sort, shuffleSeed]);

  const handleEditPress = () => {
    bottomSheetModalRef.current?.dismiss();
    if (!folder) return;
    router.navigate({
      pathname: "/playlist-folders/[key]/edit",
      params: { key: folder.key },
    });
  };

  const handleDeleteConfirm = () => {
    setShowDeleteDialog(false);
    if (!folder) return;
    const updates: PlaylistFolderAssignmentUpdates = {};
    for (const { playlist } of folder.members) {
      updates[playlist.id] = folderAssignmentFor(
        playlist,
        null,
        options.separator,
      );
    }
    deletePlaylistFolder(folder.key, updates);
    goBackOrHome(router);
  };

  return (
    <Box className="h-full w-full">
      <Box className="px-6 pb-4" style={{ paddingTop: insets.top + 16 }}>
        <HStack className="items-center justify-between">
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <VStack className="mx-4 flex-1 items-center">
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate"
              size="lg"
            >
              {folder?.name}
            </Heading>
            {folder && (
              <Text className="text-primary-100 text-sm">
                {t("app.shared.playlistCount", {
                  count: folder.members.length,
                })}
              </Text>
            )}
          </VStack>
          {folder ? (
            <FadeOutScaleDown
              onPress={() => bottomSheetModalRef.current?.present()}
            >
              <EllipsisVertical size={24} color={white} />
            </FadeOutScaleDown>
          ) : (
            <Box className="w-6" />
          )}
        </HStack>
      </Box>
      {error && !folder && <ErrorDisplay error={error} />}
      <LegendList
        recycleItems
        key={`playlist-folder-${layout}-${gridColumns}`}
        data={
          isLoading
            ? (loadingData(8) as PlaylistFolderMember<Playlist>[])
            : members
        }
        keyExtractor={(item, index) =>
          isLoading ? `skeleton-${index}` : item.playlist.id
        }
        numColumns={gridColumns}
        renderItem={({ item }) =>
          isLoading ? (
            <LibraryListItemSkeleton layout={layout} />
          ) : (
            <LibraryListItem
              item={item.playlist as unknown as LibraryItem}
              title={item.title}
              layout={layout}
            />
          )
        }
        ListEmptyComponent={() =>
          isLoading ? null : folder ? (
            <EmptyDisplay hint={t("app.playlistFolders.emptyHint")} />
          ) : (
            <Text className="text-primary-100 text-md text-center my-4 px-6">
              {t("app.playlistFolders.notFound")}
            </Text>
          )
        }
        contentContainerStyle={{
          paddingHorizontal: layout === "grid" ? 16 : 24,
          paddingBottom: screenBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
      />
      <CenteredBottomSheetModal
        ref={bottomSheetModalRef}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <Box className="p-6 w-full mb-12">
            <Heading
              className="text-white font-normal"
              size="lg"
              numberOfLines={1}
            >
              {folder?.name}
            </Heading>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown onPress={handleEditPress}>
                <HStack className="items-center">
                  <Pencil size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.playlistFolders.edit")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() => {
                  bottomSheetModalRef.current?.dismiss();
                  setShowDeleteDialog(true);
                }}
              >
                <HStack className="items-center">
                  <X size={24} color={red500} />
                  <Text className="ml-4 text-lg text-red-400">
                    {t("app.playlistFolders.delete")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      <ConfirmActionDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        title={t("app.playlistFolders.deleteConfirmTitle")}
        description={t("app.playlistFolders.deleteConfirmDescription")}
        confirmLabel={t("app.shared.delete")}
        cancelLabel={t("app.shared.cancel")}
        onConfirm={handleDeleteConfirm}
        confirmVariant="danger"
      />
    </Box>
  );
}
