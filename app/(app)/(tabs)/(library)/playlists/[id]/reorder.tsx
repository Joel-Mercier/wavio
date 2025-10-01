import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import FlashDragList from "@/components/FlashDragList";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PlaylistEditSongListItem from "@/components/playlists/PlaylistEditSongListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { themeConfig } from "@/config/theme";
import {
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import type { Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReorderPlaylistScreen() {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<Child[]>([]);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const form = useForm({
    defaultValues: {
      songIndexToRemove: [],
    },
    onSubmit: async ({ value }) => {
      doUpdatePlaylist.mutate(
        { id, ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlist", id] });
            router.navigate(`/playlists/${id}`);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastDescription>
                    Playlist successfully updated
                  </ToastDescription>
                </Toast>
              ),
            });
          },
          onError: (error) => {
            console.error(error);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="error">
                  <ToastDescription>
                    An error occurred while updating the playlist
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });
  const renderItem = (
    item: Child,
    index: number,
    isActive: boolean,
    beginDrag: () => void,
  ) => {
    return (
      <PlaylistEditSongListItem
        item={item}
        index={index}
        beginDrag={beginDrag}
        isActive={isActive}
        handleRemoveFromPlaylistPress={handleRemoveFromPlaylistPress}
      />
    );
  };

  const handleListSort = (fromIndex: number, toIndex: number) => {
    const copy = [...order];
    const removed = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, removed[0]!);
    setOrder(copy);
  };

  const handleRemoveFromPlaylistPress = (index: number) => {
    form.setFieldValue("songIndexToRemove", (input) => [...input, index]);
  };

  useEffect(() => {
    if (data?.playlist) {
      setOrder(data?.playlist.entry || []);
    }
  }, [data]);

  const isDirty = useStore(form.store, (state) => state.isDirty);
  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center justify-between"
          style={{ paddingTop: insets.top + 16 }}
        >
          <FadeOutScaleDown onPress={() => router.back()}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <X size={24} color={themeConfig.theme.colors.white} />
            </Box>
          </FadeOutScaleDown>
          <Heading className="text-white font-bold" size="lg">
            Edit playlist
          </Heading>
          <FadeOutScaleDown onPress={isDirty ? form.handleSubmit : undefined}>
            <Text
              className={cn("text-emerald-500 font-bold text-lg", {
                "opacity-75": !isDirty,
              })}
            >
              Save
            </Text>
          </FadeOutScaleDown>
        </HStack>
      </Box>
      <FlashDragList
        data={order}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        itemsSize={70}
        onSort={handleListSort}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
