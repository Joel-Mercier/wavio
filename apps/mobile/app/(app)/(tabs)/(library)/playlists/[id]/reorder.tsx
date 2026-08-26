import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import DraggableFlashList from "@/components/DraggableFlashList";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlaylistEditSongListItem, {
  PLAYLIST_EDIT_ITEM_HEIGHT,
} from "@/components/playlists/PlaylistEditSongListItem";
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
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Child } from "@/services/openSubsonic/types";
import useApp from "@/stores/app";
import usePlaylists from "@/stores/playlists";
import { loadingData } from "@/utils/loadingData";
import { logError } from "@/utils/log";
import { goBackOrHome } from "@/utils/navigation";
import { orderPlaylistEntries } from "@/utils/playlistOrder";
import { cn } from "@/utils/tailwind";

// The rows carry a uid assigned once when the order is seeded: a positional key
// would change for every row between the two positions on each drop, forcing
// FlashList to throw away their recycled state (and reload their artwork).
type OrderedEntry = { uid: string; entry: Child };

export default function ReorderPlaylistScreen() {
  const [white, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<OrderedEntry[]>([]);
  const [initialOrder, setInitialOrder] = useState<OrderedEntry[]>([]);
  const [removedItems, setRemovedItems] = useState<Set<Child>>(new Set());
  const isWideLayout = useApp((s) => s.isWideLayout);
  const screenBottomPadding = useScreenBottomPadding();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
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
          order.map((item) => item.entry.id),
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
    item: OrderedEntry,
    _index: number,
    isActive: boolean,
  ) => {
    return (
      <PlaylistEditSongListItem
        item={item.entry}
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

  const handleRemoveFromPlaylistPress = (item: OrderedEntry) => {
    setRemovedItems((prev) => {
      const next = new Set(prev);
      next.add(item.entry);
      return next;
    });
    setOrder((prev) => prev.filter((entry) => entry.uid !== item.uid));
  };

  // Always the playlist's own order (server order + the saved manual overlay),
  // whatever field sort the detail screen is currently displaying — this screen
  // *is* how that order gets edited, so seeding it from a field sort would
  // overwrite the manual order on save.
  useEffect(() => {
    if (playlistData?.playlist) {
      const keyed = orderPlaylistEntries(
        playlistData.playlist.entry || [],
        getPlaylistTrackOrder(id),
      ).map((entry, index) => ({ uid: `${entry.id}-${index}`, entry }));
      setOrder(keyed);
      setInitialOrder(keyed);
    }
  }, [playlistData, id, getPlaylistTrackOrder]);

  const hasOrderChanged = useMemo(() => {
    if (order.length !== initialOrder.length) return true;
    return order.some((item, index) => item.uid !== initialOrder[index]?.uid);
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
          data={order}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          itemHeight={PLAYLIST_EDIT_ITEM_HEIGHT}
          onSort={handleListSort}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: screenBottomPadding,
          }}
        />
      )}
    </Box>
  );
}
