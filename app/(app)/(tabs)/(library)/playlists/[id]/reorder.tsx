import DraggableFlashList from "@/components/DraggableFlashList";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import usePlaylists from "@/stores/playlists";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReorderPlaylistScreen() {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<Child[]>([]);
  const [initialOrder, setInitialOrder] = useState<Child[]>([]);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistSorts = usePlaylists((store) => store.playlistSorts);
  const sort = playlistSorts[id] ?? "addedAtAsc";
  const getPlaylistTrackPositions = usePlaylists(
    (store) => store.getPlaylistTrackPositions,
  );
  const setPlaylistTrackPositions = usePlaylists(
    (store) => store.setPlaylistTrackPositions,
  );
  const { data: playlistData, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const form = useForm({
    defaultValues: {
      songIndexToRemove: [] as string[],
    },
    onSubmit: async ({ value }) => {
      if (order.length > 0) {
        const positions: Record<string, number> = {};
        order.forEach((item, index) => {
          positions[item.id] = index;
        });
        setPlaylistTrackPositions(id, positions);
      }

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
    if (removed[0]) {
      copy.splice(toIndex, 0, removed[0]);
    }
    setOrder(copy);
  };

  const handleRemoveFromPlaylistPress = (index: number) => {
    form.setFieldValue("songIndexToRemove", (input) => [
      ...input,
      String(index),
    ]);
  };

  useEffect(() => {
    if (playlistData?.playlist) {
      const entries = playlistData.playlist.entry || [];
      const storedPositions = getPlaylistTrackPositions(id);

      if (storedPositions && sort === "addedAtAsc") {
        const sorted = [...entries].sort((a, b) => {
          const posA = storedPositions[a.id];
          const posB = storedPositions[b.id];
          if (posA !== undefined && posB !== undefined) {
            return posA - posB;
          }
          if (posA !== undefined) return -1;
          if (posB !== undefined) return 1;
          return 0;
        });
        setOrder(sorted);
        setInitialOrder(sorted);
      } else {
        setOrder(entries);
        setInitialOrder(entries);
      }
    }
  }, [playlistData, id, sort, getPlaylistTrackPositions]);

  const data = useMemo(() => {
    if (
      !playlistData ||
      !playlistData?.playlist ||
      !playlistData?.playlist.entry
    ) {
      return null;
    }
    const newData = [...playlistData.playlist.entry];
    const storedPositions = getPlaylistTrackPositions(id);

    if (storedPositions && sort === "addedAtAsc") {
      return newData.sort((a, b) => {
        const posA = storedPositions[a.id];
        const posB = storedPositions[b.id];
        // If both have positions, sort by position
        if (posA !== undefined && posB !== undefined) {
          return posA - posB;
        }
        // If only one has position, prioritize it
        if (posA !== undefined) return -1;
        if (posB !== undefined) return 1;
        // If neither has position, maintain original order
        return 0;
      });
    }

    if (sort === "addedAtAsc") {
      return newData;
    }
    if (sort === "addedAtDesc") {
      return newData.reverse();
    }
    if (sort === "alphabeticalAsc") {
      return newData.sort((a, b) => {
        return (a?.sortName || a.title).localeCompare(b?.sortName || b.title);
      });
    }
    if (sort === "alphabeticalDesc") {
      return newData.sort((a, b) => {
        return (b?.sortName || b.title).localeCompare(a?.sortName || a.title);
      });
    }
  }, [playlistData, sort, id, getPlaylistTrackPositions]);

  const isDirty = useStore(form.store, (state) => state.isDirty);
  const hasOrderChanged = useMemo(() => {
    if (order.length !== initialOrder.length) return true;
    return order.some((item, index) => item.id !== initialOrder[index]?.id);
  }, [order, initialOrder]);

  const canSave = isDirty || hasOrderChanged;

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
          <FadeOutScaleDown onPress={canSave ? form.handleSubmit : undefined}>
            <Text
              className={cn("text-emerald-500 font-bold text-lg", {
                "opacity-75": !canSave,
              })}
            >
              Save
            </Text>
          </FadeOutScaleDown>
        </HStack>
      </Box>
      <DraggableFlashList
        data={order.length > 0 ? order : data || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        itemHeight={70}
        onSort={handleListSort}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
