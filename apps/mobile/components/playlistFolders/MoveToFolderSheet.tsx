import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import Check from "lucide-react-native/icons/check";
import Folder from "lucide-react-native/icons/folder";
import FolderMinus from "lucide-react-native/icons/folder-minus";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import { usePlaylistFolderOptions } from "@/hooks/usePlaylistFolderOptions";
import usePlaylistsStore from "@/stores/playlists";
import {
  folderAssignmentFor,
  groupPlaylistsIntoFolders,
  PLAYLIST_FOLDER_COLOR_CLASSES,
  type PlaylistFolderGroup,
  playlistFolderRow,
} from "@/utils/playlistFolders";
import { cn } from "@/utils/tailwind";

type FolderPlaylist = { id: string; name: string; created?: string | Date };

function FolderTile({ group }: { group: PlaylistFolderGroup<FolderPlaylist> }) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  return (
    <Box
      className={cn(
        "w-12 h-12 rounded-md items-center justify-center bg-primary-400",
        group.color && PLAYLIST_FOLDER_COLOR_CLASSES[group.color],
      )}
    >
      <Folder size={24} color={white} />
    </Box>
  );
}

export default function MoveToFolderSheet({
  modalRef,
  playlist,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
  playlist?: FolderPlaylist;
}) {
  const [gray200, emerald500] = Uniwind.getCSSVariable([
    "--color-gray-200",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const options = usePlaylistFolderOptions();
  const { data } = usePlaylists({});
  const savePlaylistFolder = usePlaylistsStore(
    (store) => store.savePlaylistFolder,
  );
  const setPlaylistFolderAssignments = usePlaylistsStore(
    (store) => store.setPlaylistFolderAssignments,
  );
  const listed: FolderPlaylist[] = data?.playlists?.playlist ?? [];
  // The playlist itself may be missing from the listing (opened offline from
  // its download), and it has to resolve to its folder all the same.
  const playlists =
    playlist && !listed.some(({ id }) => id === playlist.id)
      ? [...listed, playlist]
      : listed;
  const folders = groupPlaylistsIntoFolders(playlists, options).folders.sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  const currentKey = folders.find((folder) =>
    folder.members.some((member) => member.playlist.id === playlist?.id),
  )?.key;

  const handleFolderPress = (folder: PlaylistFolderGroup<FolderPlaylist>) => {
    modalRef.current?.dismiss();
    if (!playlist || folder.key === currentKey) return;
    const created = playlistFolderRow(folder).created;
    savePlaylistFolder(
      folder.key,
      {
        name: folder.name,
        color: folder.color,
        createdAt: created ? new Date(created).getTime() : undefined,
      },
      { [playlist.id]: folder.key },
    );
  };

  const handleRemovePress = () => {
    modalRef.current?.dismiss();
    if (!playlist) return;
    setPlaylistFolderAssignments({
      [playlist.id]: folderAssignmentFor(playlist, null, options.separator),
    });
  };

  const handleNewFolderPress = () => {
    modalRef.current?.dismiss();
    router.navigate({
      pathname: "/playlists/new-folder",
      params: playlist ? { playlistId: playlist.id } : {},
    });
  };

  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      enableHalfExpand={false}
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
          <Heading className="text-white font-bold" size="md">
            {t("app.playlistFolders.moveToFolder")}
          </Heading>
          <VStack className="mt-6 gap-y-6">
            <FadeOutScaleDown onPress={handleNewFolderPress}>
              <HStack className="items-center">
                <FolderPlus size={24} color={gray200} />
                <Text className="ml-4 text-lg text-gray-200">
                  {t("app.playlistFolders.newFolder")}
                </Text>
              </HStack>
            </FadeOutScaleDown>
            {currentKey && (
              <FadeOutScaleDown onPress={handleRemovePress}>
                <HStack className="items-center">
                  <FolderMinus size={24} color={gray200} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {t("app.playlistFolders.removeFromFolder")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            )}
            {folders.map((folder) => (
              <FadeOutScaleDown
                key={folder.key}
                onPress={() => handleFolderPress(folder)}
              >
                <HStack className="items-center">
                  <FolderTile group={folder} />
                  <VStack className="ml-4 flex-1">
                    <Text numberOfLines={1} className="text-lg text-white">
                      {folder.name}
                    </Text>
                    <Text className="text-sm text-primary-100">
                      {t("app.shared.playlistCount", {
                        count: folder.members.length,
                      })}
                    </Text>
                  </VStack>
                  {folder.key === currentKey && (
                    <Check size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
