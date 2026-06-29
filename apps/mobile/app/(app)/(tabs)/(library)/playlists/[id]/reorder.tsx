import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import DraggableFlashList from "@/components/DraggableFlashList";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlaylistEditSongListItem from "@/components/playlists/PlaylistEditSongListItem";
import TrackListItemSkeleton from "@/components/tracks/TrackListItemSkeleton";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { usePlaylist, useUpdatePlaylist } from "@/hooks/backend/usePlaylists";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import type { Child } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import usePlaylists from "@/stores/playlists";
import { loadingData } from "@/utils/loadingData";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { orderPlaylistEntries } from "@/utils/playlistOrder";
import { cn } from "@/utils/tailwind";

export default function ReorderPlaylistScreen() {
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<Child[]>([]);
  const [initialOrder, setInitialOrder] = useState<Child[]>([]);
  const [removedItems, setRemovedItems] = useState<Set<Child>>(new Set());
  const isWideLayout = useApp((s) => s.isWideLayout);
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistSorts = usePlaylists((store) => store.playlistSorts);
  const sort = playlistSorts[id] ?? "addedAtAsc";
  const getPlaylistTrackOrder = usePlaylists(
    (store) => store.getPlaylistTrackOrder,
  );
  const setPlaylistTrackOrder = usePlaylists(
    (store) => store.setPlaylistTrackOrder,
  );
  const { data: playlistData, isLoading, error } = usePlaylist(id);
  const doUpdatePlaylist = useUpdatePlaylist();
  const form = useForm({
    defaultValues: {},
    onSubmit: async () => {
      if (order.length > 0) {
        setPlaylistTrackOrder(
          id,
          order.map((item) => item.id),
        );
      }

      const serverEntries = playlistData?.playlist?.entry || [];
      const songIndexToRemove = serverEntries
        .map((entry, index) => (removedItems.has(entry) ? String(index) : null))
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
            logError(error);
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
          handleRemoveFromPlaylistPress(item)
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

  const handleRemoveFromPlaylistPress = (track: Child) => {
    setRemovedItems((prev) => {
      const next = new Set(prev);
      next.add(track);
      return next;
    });
    setOrder((prev) => prev.filter((item) => item !== track));
  };

  useEffect(() => {
    if (playlistData?.playlist) {
      const entries = playlistData.playlist.entry || [];
      const storedOrder = getPlaylistTrackOrder(id);

      if (storedOrder && sort === "addedAtAsc") {
        const sorted = orderPlaylistEntries(entries, storedOrder);
        setOrder(sorted);
        setInitialOrder(sorted);
      } else {
        setOrder(entries);
        setInitialOrder(entries);
      }
    }
  }, [playlistData, id, sort, getPlaylistTrackOrder]);

  const data = useMemo(() => {
    if (
      !playlistData ||
      !playlistData?.playlist ||
      !playlistData?.playlist.entry
    ) {
      return null;
    }
    const newData = [...playlistData.playlist.entry];
    const storedOrder = getPlaylistTrackOrder(id);

    if (storedOrder && sort === "addedAtAsc") {
      return orderPlaylistEntries(newData, storedOrder);
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
  }, [playlistData, sort, id, getPlaylistTrackOrder]);

  const hasOrderChanged = useMemo(() => {
    if (order.length !== initialOrder.length) return true;
    return order.some((item, index) => item.id !== initialOrder[index]?.id);
  }, [order, initialOrder]);

  const canSave = hasOrderChanged || removedItems.size > 0;

  return (
    <Box className="h-full flex-1">
      <Box className="px-6 pb-6 bg-black">
        <HStack
          className="items-center"
          style={{ paddingTop: insets.top + (isWideLayout ? 0 : 16) }}
        >
          <Box className="flex-1 items-start">
            <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
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
            <FadeOutScaleDown
              onPress={form.handleSubmit}
              disabled={!canSave || doUpdatePlaylist.isPending}
            >
              {doUpdatePlaylist.isPending ? (
                <Spinner color={emerald500} />
              ) : (
                <Text
                  className={cn("text-emerald-500 font-bold text-lg", {
                    "opacity-75": !canSave,
                  })}
                >
                  {t("app.shared.save")}
                </Text>
              )}
            </FadeOutScaleDown>
          </Box>
        </HStack>
      </Box>
      {error && <ErrorDisplay error={error as Error} />}
      {!error && isLoading && !playlistData && (
        <Box className="px-6">
          {loadingData(8).map((_, index) => (
            <TrackListItemSkeleton key={`skeleton-${index}`} index={index} />
          ))}
        </Box>
      )}
      {!error && (!isLoading || playlistData) && (
        <DraggableFlashList
          data={order.length > 0 ? order : data || []}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderItem}
          itemHeight={70}
          onSort={handleListSort}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + bottomTabBarHeight + floatingPlayerInset,
          }}
        />
      )}
    </Box>
  );
}
