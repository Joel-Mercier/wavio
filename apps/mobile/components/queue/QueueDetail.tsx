import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Check from "lucide-react-native/dist/esm/icons/check.mjs";
import ListOrdered from "lucide-react-native/dist/esm/icons/list-ordered.mjs";
import ListPlus from "lucide-react-native/dist/esm/icons/list-plus.mjs";
import Timer from "lucide-react-native/dist/esm/icons/timer.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import DraggableFlashList from "@/components/DraggableFlashList";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import CreatePlaylistFromQueueDialog from "@/components/queue/CreatePlaylistFromQueueDialog";
import QueueEditTrackItem from "@/components/queue/QueueEditTrackItem";
import QueuePodcastListItem from "@/components/queue/QueuePodcastListItem";
import TrackListItem from "@/components/tracks/TrackListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
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
import { VStack } from "@/components/ui/vstack";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import { useFloatingPlayerInset } from "@/hooks/useFloatingPlayerInset";
import { useTrackListPress } from "@/hooks/useTrackListPress";
import type { Child } from "@/services/openSubsonic/types";
import { play as playLocal } from "@/services/player";
import { useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";
import useQueue, { type QueueTrack } from "@/stores/queue";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import { ScrollView } from "../ui/scroll-view";

const QUEUE_EDIT_ITEM_HEIGHT = 70;

const queueTrackToChild = (track: QueueTrack): Child =>
  ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artistId: track.artistId,
    albumId: track.albumId,
    coverArt: track.coverArt,
    duration: track.duration,
    starred: track.starred,
    musicBrainzId: track.musicBrainzId,
    genre: track.genre,
    contentType: track.contentType,
  }) as Child;

export default function QueueDetail() {
  const [white, gray500, emerald500, gray200] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
    "--color-emerald-500",
    "--color-gray-200",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const floatingPlayerInset = useFloatingPlayerInset();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const queue = useQueue((state) => state.queue);
  const currentIndex = useQueue((state) => state.currentIndex);
  const setQueue = useQueue((state) => state.setQueue);
  const clearQueue = useQueue((state) => state.clearQueue);

  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<QueueTrack[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);

  const sleepTimerSheetRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange: handleSleepSheetPositionChange } =
    useBottomSheetBackHandler(sleepTimerSheetRef);
  const sleepEndsAt = useSleepTimer((s) => s.endsAt);
  const sleepEndOfTrack = useSleepTimer((s) => s.endOfTrack);
  const setSleepMinutes = useSleepTimer((s) => s.setMinutes);
  const setSleepEndOfTrack = useSleepTimer((s) => s.setEndOfTrack);
  const cancelSleepTimer = useSleepTimer((s) => s.cancel);
  const sleepActive = sleepEndsAt != null || sleepEndOfTrack;

  const tracks = useMemo(() => queue.map(queueTrackToChild), [queue]);
  const handleTrackPress = useTrackListPress(tracks);
  const handlePodcastPress = (index: number) => {
    useQueue.getState().setCurrentIndex(index);
    playLocal();
  };
  const playingTrackId =
    currentIndex != null ? queue[currentIndex]?.id : undefined;

  // Auto-exit edit mode when queue empties.
  useEffect(() => {
    if (queue.length === 0 && editMode) {
      setEditMode(false);
      setLocalOrder([]);
    }
  }, [queue.length, editMode]);

  const handleEnterEdit = () => {
    setLocalOrder(queue.slice());
    setEditMode(true);
  };

  const handleExitEdit = () => {
    const orderChanged =
      localOrder.length !== queue.length ||
      localOrder.some((t, i) => t.id !== queue[i]?.id);
    if (orderChanged) {
      let nextIndex = currentIndex;
      if (playingTrackId) {
        const newIdx = localOrder.findIndex((t) => t.id === playingTrackId);
        nextIndex = newIdx >= 0 ? newIdx : 0;
      }
      setQueue(localOrder, nextIndex ?? 0);
    }
    setEditMode(false);
    setLocalOrder([]);
  };

  const handleListSort = (fromIndex: number, toIndex: number) => {
    setLocalOrder((prev) => {
      const copy = prev.slice();
      const [item] = copy.splice(fromIndex, 1);
      if (item) copy.splice(toIndex, 0, item);
      return copy;
    });
  };

  const handleRemoveFromQueue = (id: string) => {
    setLocalOrder((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClearPress = () => setShowClearConfirm(true);
  const handleClearConfirm = () => {
    clearQueue();
    setShowClearConfirm(false);
    toast.show({
      placement: "top",
      duration: 2000,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>{t("app.queue.clearedMessage")}</ToastDescription>
        </Toast>
      ),
    });
  };

  const handleSleepTimerPress = () => sleepTimerSheetRef.current?.present();
  const handleSleepPresetPress = (minutes: number) => {
    setSleepMinutes(minutes);
    sleepTimerSheetRef.current?.dismiss();
  };
  const handleSleepEndOfTrackPress = () => {
    setSleepEndOfTrack();
    sleepTimerSheetRef.current?.dismiss();
  };
  const handleSleepCancelPress = () => {
    cancelSleepTimer();
    sleepTimerSheetRef.current?.dismiss();
  };

  const handleCreatePlaylistPress = () => setShowCreatePlaylist(true);

  const isEmpty = queue.length === 0;
  const iconActiveColor = white;
  const iconDisabledColor = gray500;

  return (
    <Box className="h-full">
      <Box className={cn("pb-6 flex-1", isWideLayout ? "mb-6" : "mt-6")}>
        <HStack
          className="items-center mb-4 px-6"
          style={{ paddingTop: insets.top }}
        >
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading
            className="text-white text-center truncate flex-1 mx-2"
            size="lg"
            numberOfLines={1}
          >
            {t("app.queue.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <Box className="relative">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="grow-0"
            contentContainerStyle={{ paddingHorizontal: 24 }}
          >
            <HStack className="items-center justify-end gap-x-6 mb-4">
              <FadeOutScaleDown onPress={handleSleepTimerPress}>
                <HStack className="items-center gap-x-2">
                  <Timer
                    size={16}
                    color={sleepActive ? emerald500 : iconActiveColor}
                  />
                  <Text className="text-white font-bold">
                    {t("app.queue.setTimer")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={isEmpty ? undefined : handleCreatePlaylistPress}
              >
                <HStack className="items-center gap-x-2">
                  <ListPlus
                    size={16}
                    color={isEmpty ? iconDisabledColor : iconActiveColor}
                  />
                  <Text className="text-white font-bold">
                    {t("app.queue.createPlaylistAction")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={isEmpty ? undefined : handleClearPress}
              >
                <HStack className="items-center gap-x-2">
                  <Trash2
                    size={16}
                    color={isEmpty ? iconDisabledColor : iconActiveColor}
                  />
                  <Text className="text-white font-bold">
                    {t("app.queue.clear")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={
                  isEmpty
                    ? undefined
                    : editMode
                      ? handleExitEdit
                      : handleEnterEdit
                }
              >
                <HStack className="items-center gap-x-2">
                  {editMode ? (
                    <Check size={16} color={emerald500} />
                  ) : (
                    <ListOrdered
                      size={16}
                      color={isEmpty ? iconDisabledColor : iconActiveColor}
                    />
                  )}
                  <Text className="text-white font-bold">
                    {editMode ? t("app.queue.done") : t("app.queue.order")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </HStack>
          </ScrollView>
          <LinearGradient
            colors={["#000000", "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 16,
            }}
          />
          <LinearGradient
            colors={["transparent", "#000000"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 24,
            }}
          />
        </Box>
        <Box className="px-6 flex-1">
          {isEmpty ? (
            <VStack className="flex-1 items-center justify-center">
              <Text className="text-primary-100 text-center">
                {t("app.queue.empty")}
              </Text>
            </VStack>
          ) : editMode ? (
            <DraggableFlashList
              data={localOrder}
              keyExtractor={(item, index) => `${item.id}:${index}`}
              itemHeight={QUEUE_EDIT_ITEM_HEIGHT}
              onSort={handleListSort}
              contentContainerStyle={{
                paddingBottom:
                  insets.bottom + bottomTabBarHeight + floatingPlayerInset,
              }}
              showsVerticalScrollIndicator={false}
              renderItem={(item, _index, isActive, beginDrag) => (
                <QueueEditTrackItem
                  item={item}
                  beginDrag={beginDrag}
                  isActive={isActive}
                  isPlaying={item.id === playingTrackId}
                  onRemovePress={() => handleRemoveFromQueue(item.id)}
                />
              )}
            />
          ) : (
            <FlashList
              data={queue}
              keyExtractor={(item, index) => `${item.id}:${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom:
                  insets.bottom + bottomTabBarHeight + floatingPlayerInset,
              }}
              renderItem={({ item, index }) =>
                item.source === "podcast" ? (
                  <QueuePodcastListItem
                    track={item}
                    index={index}
                    onPress={handlePodcastPress}
                  />
                ) : (
                  <TrackListItem
                    track={tracks[index]}
                    index={index}
                    onPress={handleTrackPress}
                  />
                )
              }
            />
          )}
        </Box>
      </Box>
      <AlertDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.queue.clearConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t("app.queue.clearConfirmMessage")}
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => setShowClearConfirm(false)}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleClearConfirm}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.queue.clear")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreatePlaylistFromQueueDialog
        isOpen={showCreatePlaylist}
        onClose={() => setShowCreatePlaylist(false)}
        trackIds={queue.map((q) => q.id)}
      />
      <CenteredBottomSheetModal
        ref={sleepTimerSheetRef}
        onChange={handleSleepSheetPositionChange}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center mb-6">
              <Timer size={24} color={gray200} />
              <Heading
                className="ml-4 text-white font-normal"
                size="lg"
                numberOfLines={1}
              >
                {t("app.player.sleepTimer")}
              </Heading>
            </HStack>
            <VStack className="gap-y-6">
              <FadeOutScaleDown onPress={handleSleepCancelPress}>
                <Text
                  className="text-lg"
                  style={{
                    color: !sleepActive ? emerald500 : gray200,
                  }}
                >
                  {t("app.player.sleepTimerOff")}
                </Text>
              </FadeOutScaleDown>
              {[5, 10, 15, 30, 45, 60].map((minutes) => {
                const active =
                  !sleepEndOfTrack &&
                  sleepEndsAt != null &&
                  Math.round((sleepEndsAt - Date.now()) / 60000) === minutes;
                return (
                  <FadeOutScaleDown
                    key={minutes}
                    onPress={() => handleSleepPresetPress(minutes)}
                  >
                    <Text
                      className="text-lg"
                      style={{
                        color: active ? emerald500 : gray200,
                      }}
                    >
                      {t("app.player.sleepTimerMinutes", { count: minutes })}
                    </Text>
                  </FadeOutScaleDown>
                );
              })}
              <FadeOutScaleDown onPress={handleSleepEndOfTrackPress}>
                <Text
                  className="text-lg"
                  style={{
                    color: sleepEndOfTrack ? emerald500 : gray200,
                  }}
                >
                  {t("app.player.sleepTimerEndOfTrack")}
                </Text>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
    </Box>
  );
}
