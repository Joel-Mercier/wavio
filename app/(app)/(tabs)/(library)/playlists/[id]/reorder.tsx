import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import DraggableFlashList from "@/components/DraggableFlashList";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import PlaylistEditSongListItem from "@/components/playlists/PlaylistEditSongListItem";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import {
  usePlaylist,
  useUpdatePlaylist,
} from "@/hooks/openSubsonic/usePlaylists";
import type { Child } from "@/services/openSubsonic/types";
import usePlaylists from "@/stores/playlists";
import { cn } from "@/utils/tailwind";

export default function ReorderPlaylistScreen() {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<Child[]>([]);
  const [initialOrder, setInitialOrder] = useState<Child[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
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
    defaultValues: {},
    onSubmit: async () => {
      if (order.length > 0) {
        const positions: Record<string, number> = {};
        order.forEach((item, index) => {
          positions[item.id] = index;
        });
        setPlaylistTrackPositions(id, positions);
      }

      const serverEntries = playlistData?.playlist?.entry || [];
      const songIndexToRemove = serverEntries
        .map((entry, index) =>
          removedIds.has(entry.id) ? String(index) : null,
        )
        .filter((value): value is string => value !== null);

      doUpdatePlaylist.mutate(
        { id, songIndexToRemove },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["playlist", id] });
            router.navigate(`/playlists/${id}`);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.editPlaylist.editPlaylistSuccessMessage")}
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
                  <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                  <ToastDescription>
                    {t("app.editPlaylist.editPlaylistErrorMessage")}
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
        beginDrag={beginDrag}
        isActive={isActive}
        handleRemoveFromPlaylistPress={() =>
          handleRemoveFromPlaylistPress(item.id)
        }
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

  const handleRemoveFromPlaylistPress = (trackId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
    setOrder((prev) => prev.filter((item) => item.id !== trackId));
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

  const hasOrderChanged = useMemo(() => {
    if (order.length !== initialOrder.length) return true;
    return order.some((item, index) => item.id !== initialOrder[index]?.id);
  }, [order, initialOrder]);

  const canSave = hasOrderChanged || removedIds.size > 0;

  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center"
          style={{ paddingTop: insets.top + 16 }}
        >
          <Box className="flex-1 items-start">
            <FadeOutScaleDown onPress={() => router.back()}>
              <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
                <X size={24} color={white} />
              </Box>
            </FadeOutScaleDown>
          </Box>
          <Heading
            className="text-white font-bold text-center px-2"
            size="lg"
            numberOfLines={1}
          >
            {t("app.editPlaylist.title")}
          </Heading>
          <Box className="flex-1 items-end">
            <FadeOutScaleDown onPress={canSave ? form.handleSubmit : undefined}>
              <Text
                className={cn("text-emerald-500 font-bold text-lg", {
                  "opacity-75": !canSave,
                })}
              >
                {t("app.shared.save")}
              </Text>
            </FadeOutScaleDown>
          </Box>
        </HStack>
      </Box>
      <DraggableFlashList
        data={order.length > 0 ? order : data || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        itemHeight={70}
        onSort={handleListSort}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
      />
    </Box>
  );
}
