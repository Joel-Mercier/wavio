import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FloatingSubmitButton, {
  FLOATING_SUBMIT_BUTTON_SPACE,
} from "@/components/FloatingSubmitButton";
import AddToPlaylistListItem from "@/components/playlists/AddToPlaylistListItem";
import AddToPlaylistListItemSkeleton from "@/components/playlists/AddToPlaylistListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { usePlaylists } from "@/hooks/backend/usePlaylists";
import { usePlaylistFolderOptions } from "@/hooks/usePlaylistFolderOptions";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Playlist } from "@/services/openSubsonic/types";
import usePlaylistsStore, {
  type PlaylistFolderAssignmentUpdates,
} from "@/stores/playlists";
import { loadingData } from "@/utils/loadingData";
import { goBackOrHome } from "@/utils/navigation";
import {
  folderAssignmentFor,
  folderKey,
  groupPlaylistsIntoFolders,
  PLAYLIST_FOLDER_COLOR_CLASSES,
  PLAYLIST_FOLDER_COLORS,
  type PlaylistFolderColor,
  type PlaylistFolderGroup,
  playlistFolderRow,
} from "@/utils/playlistFolders";
import { cn } from "@/utils/tailwind";

export default function PlaylistFolderForm({
  editKey,
  playlistId,
}: {
  editKey?: string;
  // Preselected, for a folder created from a playlist's Move to folder.
  playlistId?: string;
}) {
  const { data, isLoading, error } = usePlaylists({});
  const options = usePlaylistFolderOptions();
  const playlists = data?.playlists?.playlist ?? [];
  const renamedTo = usePlaylistsStore((store) =>
    editKey ? store.playlistFolderRenames[editKey] : undefined,
  );
  const { folders } = groupPlaylistsIntoFolders(playlists, options);
  // Saving a rename moves the folder while this screen is still animating out.
  const editing = editKey
    ? (folders.find((folder) => folder.key === editKey) ??
      folders.find((folder) => folder.key === renamedTo))
    : undefined;

  return (
    <PlaylistFolderFormBody
      // The initial values are read once, so remount when the folder being
      // edited only shows up after the playlist list arrives.
      key={`${isLoading}-${Boolean(editing)}`}
      playlists={playlists}
      folders={folders}
      editing={editing}
      playlistId={playlistId}
      isLoading={isLoading}
      error={error}
    />
  );
}

function PlaylistFolderFormBody({
  playlists,
  folders,
  editing,
  playlistId,
  isLoading,
  error,
}: {
  playlists: Playlist[];
  folders: PlaylistFolderGroup<Playlist>[];
  editing?: PlaylistFolderGroup<Playlist>;
  playlistId?: string;
  isLoading: boolean;
  error: Error | null;
}) {
  const [white, gray400] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-400",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const separator = usePlaylistFolderOptions().separator;
  const savePlaylistFolder = usePlaylistsStore(
    (store) => store.savePlaylistFolder,
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState<PlaylistFolderColor | null>(
    editing?.color ?? null,
  );
  const [initiallySelected] = useState<string[]>(() => {
    const ids = editing?.members.map(({ playlist }) => playlist.id) ?? [];
    return playlistId && !ids.includes(playlistId) ? [...ids, playlistId] : ids;
  });
  const [selected, setSelected] = useState(initiallySelected);
  // The folder's playlists first, and kept there while toggling so rows don't
  // jump under the finger.
  const orderedPlaylists = [
    ...playlists.filter(({ id }) => initiallySelected.includes(id)),
    ...playlists.filter(({ id }) => !initiallySelected.includes(id)),
  ];

  const key = folderKey(name);
  const nameTaken =
    key.length > 0 &&
    key !== editing?.key &&
    folders.some((folder) => folder.key === key);
  const canSave = key.length > 0 && !nameTaken;

  const handlePlaylistPress = (id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  };

  const handleSavePress = () => {
    if (!canSave) return;
    const memberIds = new Set(
      editing?.members.map(({ playlist }) => playlist.id),
    );
    const updates: PlaylistFolderAssignmentUpdates = {};
    for (const playlist of playlists) {
      if (selected.includes(playlist.id)) {
        updates[playlist.id] = key;
      } else if (memberIds.has(playlist.id)) {
        updates[playlist.id] = folderAssignmentFor(playlist, null, separator);
      }
    }
    // A detected folder saved here for the first time keeps its place in the
    // "added" sort instead of jumping to now.
    const created = editing ? playlistFolderRow(editing).created : undefined;
    savePlaylistFolder(
      editing?.key ?? null,
      {
        name,
        color,
        createdAt: created ? new Date(created).getTime() : undefined,
      },
      updates,
    );
    goBackOrHome(router);
  };

  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
          <Heading
            className="text-white font-bold text-center truncate flex-1"
            size="lg"
          >
            {t(
              editing
                ? "app.playlistFolders.editTitle"
                : "app.playlistFolders.newTitle",
            )}
          </Heading>
          <Box className="w-10" />
        </HStack>
      </Box>
      <LegendList
        recycleItems
        data={isLoading ? (loadingData(8) as Playlist[]) : orderedPlaylists}
        keyExtractor={(item) => String(item.id)}
        extraData={{ selected }}
        renderItem={({ item, extraData }) =>
          isLoading ? (
            <AddToPlaylistListItemSkeleton />
          ) : (
            <AddToPlaylistListItem
              playlist={item}
              selected={extraData.selected.includes(item.id)}
              onPress={handlePlaylistPress}
            />
          )
        }
        contentContainerStyle={{
          paddingBottom: screenBottomPadding + FLOATING_SUBMIT_BUTTON_SPACE,
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <VStack className="px-6 gap-y-6 mb-4">
            <VStack className="gap-y-2">
              <Input className="border border-primary-400 bg-primary-400 data-[focus=true]:border-emerald-500 px-6 py-4">
                <InputField
                  disableFullscreenUI
                  value={name}
                  onChangeText={setName}
                  autoFocus={!editing}
                  className="text-2xl text-white font-bold rounded-md"
                  placeholder={t("app.playlistFolders.namePlaceholder")}
                  placeholderTextColor={gray400}
                />
              </Input>
              {nameTaken && (
                <Text className="text-red-400 text-sm">
                  {t("app.playlistFolders.nameTaken")}
                </Text>
              )}
            </VStack>
            <VStack className="gap-y-3">
              <Heading size="sm" className="text-gray-300">
                {t("app.playlistFolders.colorLabel")}
              </Heading>
              <HStack className="flex-wrap gap-3">
                {[null, ...PLAYLIST_FOLDER_COLORS].map((option) => (
                  <FadeOutScaleDown
                    key={option ?? "none"}
                    onPress={() => setColor(option)}
                  >
                    <Box
                      className={cn(
                        "w-10 h-10 rounded-full items-center justify-center bg-primary-600 border-2 border-transparent",
                        option && PLAYLIST_FOLDER_COLOR_CLASSES[option],
                        { "border-white": color === option },
                      )}
                    >
                      {color === option && <Check size={20} color={white} />}
                    </Box>
                  </FadeOutScaleDown>
                ))}
              </HStack>
            </VStack>
            <Heading size="sm" className="text-gray-300">
              {t("app.playlistFolders.playlistsLabel")}
            </Heading>
            {error && <ErrorDisplay error={error} />}
          </VStack>
        }
      />
      <FloatingSubmitButton
        label={t(editing ? "app.shared.save" : "app.shared.create")}
        onPress={handleSavePress}
        disabled={!canSave}
      />
    </Box>
  );
}
