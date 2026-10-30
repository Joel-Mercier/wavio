import { LegendList } from "@legendapp/list/react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import Check from "lucide-react-native/icons/check";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import ListPlus from "lucide-react-native/icons/list-plus";
import Timer from "lucide-react-native/icons/timer";
import Trash from "lucide-react-native/icons/trash";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import DraggableList from "@/components/DraggableList";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { openSleepTimerSheet } from "@/components/player/SleepTimerSheet";
import CreatePlaylistFromQueueDialog from "@/components/queue/CreatePlaylistFromQueueDialog";
import QueueEditLaneDivider from "@/components/queue/QueueEditLaneDivider";
import QueueEditTrackItem from "@/components/queue/QueueEditTrackItem";
import QueueEndFooter from "@/components/queue/QueueEndFooter";
import QueuePodcastListItem from "@/components/queue/QueuePodcastListItem";
import TabBar from "@/components/TabBar";
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
import { useQueueRemovalToast } from "@/hooks/useQueueRemovalToast";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import type { Child } from "@/services/openSubsonic/types";
import { play as playLocal, startTrackRadio } from "@/services/player";
import { reconcilePlayHistory } from "@/services/playHistory/reconcile";
import { isSleepTimerActive, useSleepTimer } from "@/services/sleepTimer";
import useApp from "@/stores/app";
import usePlayHistory, { type PlayHistoryEntry } from "@/stores/playHistory";
import useQueue, { manualLaneEnd, type QueueTrack } from "@/stores/queue";
import { childToTrack, trackToChild } from "@/utils/childToTrack";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import { TOAST_DURATION } from "@/utils/toastDuration";
import { isSpokenWordTrack } from "@/utils/trackSource";
import { ScrollView } from "../ui/scroll-view";

const QUEUE_EDIT_ITEM_HEIGHT = 70;

const noop = () => {};

// Rows carry a uid assigned once on entering edit mode: a positional key would
// change for every row between the two positions on each drop (throwing away
// the list's recycled rows), and the queue can hold the same track twice, so
// the track id alone is not unique either. The lane boundary is a row of its
// own so the split stays visible while dragging and moving a track across it
// is what changes its lane, rather than a silent demotion on Done.
type EditRow =
  | { kind: "track"; uid: string; track: QueueTrack }
  | { kind: "divider"; uid: "divider" };

const LANE_DIVIDER: EditRow = { kind: "divider", uid: "divider" };

type QueueRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "track"; key: string; track: QueueTrack; index: number };

const historyEntryToChild = (entry: PlayHistoryEntry): Child =>
  ({
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    album: entry.album,
    artistId: entry.artistId,
    albumId: entry.albumId,
    coverArt: entry.coverArt,
    duration: entry.duration,
    contentType: entry.contentType,
    replayGain: entry.replayGain,
  }) as Child;

export default function QueueDetail() {
  const [white, gray500, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const queue = useQueue((state) => state.queue);
  const currentIndex = useQueue((state) => state.currentIndex);
  const source = useQueue((state) => state.source);
  const setQueue = useQueue((state) => state.setQueue);
  const clearUpcoming = useQueue((state) => state.clearUpcoming);
  const clearHistory = usePlayHistory((state) => state.clearHistory);

  const [activeTab, setActiveTab] = useState<"queue" | "recentlyPlayed">(
    "queue",
  );
  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<EditRow[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);

  const sleepActive = useSleepTimer(isSleepTimerActive);

  const tracks = useMemo(() => queue.map(trackToChild), [queue]);
  // The rows already *are* the queue: jump to the tapped index rather than
  // replaying the list, which would rebuild (and under shuffle re-randomise)
  // the very order the user is looking at, and drop the "Playing from" source.
  const handleQueueItemPress = useCallback((index: number) => {
    useQueue.getState().setCurrentIndex(index);
    playLocal();
  }, []);

  const showRemovalToast = useQueueRemovalToast();
  const handleSwipeRemove = useCallback(
    (index: number, row: Child) => {
      const { queue: current, currentIndex: cursor } = useQueue.getState();
      const removed = current[index];
      if (!removed || removed.id !== row.id || index <= (cursor ?? -1)) {
        return false;
      }
      useQueue.getState().removeAtIndices([index]);
      showRemovalToast([{ track: removed, index }]);
      return true;
    },
    [showRemovalToast],
  );
  const hasCurrent =
    currentIndex != null && currentIndex >= 0 && currentIndex < queue.length;
  const playingTrackId = hasCurrent ? queue[currentIndex]?.id : undefined;
  const currentTrack = hasCurrent ? queue[currentIndex] : undefined;
  const upcomingStart = hasCurrent ? currentIndex + 1 : 0;
  const laneEnd = manualLaneEnd(queue, hasCurrent ? currentIndex : null);
  const hasLane = laneEnd > upcomingStart;
  const hasUpcoming = queue.length > upcomingStart;
  const contextLabel = source?.name
    ? t("app.queue.nextFrom", { name: source.name })
    : t("app.queue.nextUp");

  // Tracks already played (before the current index) are hidden from the queue.
  // What follows the current track splits into the manual lane ("Next in
  // queue") and the context it was added on top of ("Next from …").
  const queueRows = useMemo<QueueRow[]>(() => {
    const rows: QueueRow[] = [];
    const start = hasCurrent ? currentIndex : 0;
    for (let index = start; index < queue.length; index++) {
      const track = queue[index];
      if (index === currentIndex) {
        rows.push({
          kind: "header",
          key: "header-now-playing",
          label: t("app.queue.nowPlaying"),
        });
      } else if (index === upcomingStart && hasLane) {
        rows.push({
          kind: "header",
          key: "header-next-in-queue",
          label: t("app.queue.nextInQueue"),
        });
      } else if (index === laneEnd) {
        rows.push({
          kind: "header",
          key: "header-next-from",
          label: contextLabel,
        });
      }
      rows.push({ kind: "track", key: `${track.id}:${index}`, track, index });
    }
    return rows;
  }, [
    queue,
    currentIndex,
    hasCurrent,
    upcomingStart,
    laneEnd,
    hasLane,
    contextLabel,
    t,
  ]);

  // History is its own persisted store, not a slice of the queue: playing a new
  // album replaces the queue but must not erase what came before.
  const history = usePlayHistory((state) => state.history);
  const historyTracks = useMemo(
    () => history.map(historyEntryToChild),
    [history],
  );
  const handleHistoryPress = useCallback(
    async (_index: number, track: Child) => {
      // TrackListItem already disables rows that are unavailable offline, but
      // connectivity can flip between render and tap — startTrackRadio then
      // leaves the queue alone, so surface that instead of doing nothing.
      if (await startTrackRadio(childToTrack(track))) return;
      toast.show({
        placement: "top",
        duration: TOAST_DURATION.default,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.shared.notAvailableOfflineMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    },
    [t, toast],
  );

  // Prune entries the server has since deleted. Best-effort and self-throttled,
  // so firing it on every tab switch is fine.
  useEffect(() => {
    if (activeTab !== "recentlyPlayed") return;
    void reconcilePlayHistory();
  }, [activeTab]);

  // Auto-exit edit mode when queue empties.
  useEffect(() => {
    if (queue.length === 0 && editMode) {
      setEditMode(false);
      setLocalOrder([]);
    }
  }, [queue.length, editMode]);

  // Only the tracks after the current one are reorderable; the played history
  // and the currently playing track keep their position.
  const handleEnterEdit = () => {
    const rows: EditRow[] = queue.slice(upcomingStart).map((track, index) => ({
      kind: "track",
      uid: `${track.id}:${index}`,
      track,
    }));
    if (hasLane) rows.splice(laneEnd - upcomingStart, 0, LANE_DIVIDER);
    setLocalOrder(rows);
    setEditMode(true);
  };

  // Everything above the divider is the lane, everything below is context.
  const handleExitEdit = () => {
    const before = hasCurrent ? queue.slice(0, currentIndex) : [];
    const head = currentTrack ? [currentTrack] : [];
    const dividerAt = localOrder.findIndex((row) => row.kind === "divider");
    const upcoming: QueueTrack[] = [];
    localOrder.forEach((row, index) => {
      if (row.kind !== "track") return;
      const inLane = index < dividerAt;
      if (inLane === Boolean(row.track.queuedManually)) {
        upcoming.push(row.track);
        return;
      }
      const { queuedManually: _, ...track } = row.track;
      upcoming.push(inLane ? { ...track, queuedManually: true } : track);
    });
    const nextQueue = [...before, ...head, ...upcoming];
    const orderChanged =
      nextQueue.length !== queue.length ||
      nextQueue.some((t, i) => t !== queue[i]);
    if (orderChanged) {
      setQueue(nextQueue, hasCurrent ? currentIndex : (currentIndex ?? 0));
    }
    setEditMode(false);
    setLocalOrder([]);
  };

  const handleTabPress = (index: number) => {
    const tab = index === 0 ? "queue" : "recentlyPlayed";
    if (tab === activeTab) return;
    if (editMode) handleExitEdit();
    setActiveTab(tab);
  };

  const handleListSort = (fromIndex: number, toIndex: number) => {
    setLocalOrder((prev) => {
      const copy = prev.slice();
      const [item] = copy.splice(fromIndex, 1);
      if (item) copy.splice(toIndex, 0, item);
      return copy;
    });
  };

  const handleRemoveFromQueue = (uid: string) => {
    setLocalOrder((prev) => prev.filter((row) => row.uid !== uid));
  };

  const hasDivider = localOrder.some((row) => row.kind === "divider");

  // Rendered as the list header so the pinned track scrolls away with the rows.
  const editHeader = useMemo(() => {
    if (!currentTrack) return undefined;
    return (
      <>
        <Heading
          size="sm"
          className="text-gray-300 mt-6 mb-2"
          numberOfLines={1}
        >
          {t("app.queue.nowPlaying")}
        </Heading>
        <QueueEditTrackItem
          item={currentTrack}
          isActive={false}
          isPlaying
          onRemovePress={noop}
          pinned
        />
        {localOrder.length > 0 && (
          <Heading
            size="sm"
            className="text-gray-300 mt-6 mb-2"
            numberOfLines={1}
          >
            {hasDivider ? t("app.queue.nextInQueue") : contextLabel}
          </Heading>
        )}
      </>
    );
  }, [currentTrack, localOrder.length, hasDivider, contextLabel, t]);

  // The Trash action follows the active tab: each list owns its own clear.
  const isHistoryTab = activeTab === "recentlyPlayed";
  const handleClearPress = () => setShowClearConfirm(true);
  const handleClearConfirm = () => {
    if (isHistoryTab) {
      clearHistory();
    } else {
      clearUpcoming();
    }
    setShowClearConfirm(false);
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.short,
      render: () => (
        <Toast action="success">
          <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
          <ToastDescription>
            {isHistoryTab
              ? t("app.queue.clearedHistoryMessage")
              : t("app.queue.clearedMessage")}
          </ToastDescription>
        </Toast>
      ),
    });
  };

  const handleSleepTimerPress = () => openSleepTimerSheet();

  const handleCreatePlaylistPress = () => setShowCreatePlaylist(true);

  const isEmpty = queue.length === 0;
  const clearDisabled = isHistoryTab ? history.length === 0 : !hasUpcoming;
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
              {activeTab === "queue" && (
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
              )}
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
                onPress={clearDisabled ? undefined : handleClearPress}
              >
                <HStack className="items-center gap-x-2">
                  <Trash
                    size={16}
                    color={clearDisabled ? iconDisabledColor : iconActiveColor}
                  />
                  <Text className="text-white font-bold">
                    {isHistoryTab
                      ? t("app.queue.clearHistory")
                      : t("app.queue.clear")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
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
        <TabBar
          tabs={[
            { key: "queue", title: t("app.queue.tabQueue") },
            { key: "recentlyPlayed", title: t("app.queue.tabRecentlyPlayed") },
          ]}
          activeIndex={activeTab === "queue" ? 0 : 1}
          onTabPress={handleTabPress}
        />
        {/* The queue list runs edge to edge so the swipe panels behind its rows
            aren't clipped by the screen padding; its rows pad themselves. */}
        <Box
          className={cn("flex-1", {
            "px-6": activeTab !== "queue" || isEmpty || editMode,
          })}
        >
          {activeTab === "recentlyPlayed" ? (
            historyTracks.length === 0 ? (
              <VStack className="flex-1 items-center justify-center">
                <Text className="text-primary-100 text-center">
                  {t("app.queue.recentlyPlayedEmpty")}
                </Text>
              </VStack>
            ) : (
              <LegendList
                recycleItems
                data={historyTracks}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingBottom: screenBottomPadding,
                }}
                renderItem={({ item, index }) => (
                  <TrackListItem
                    track={item}
                    index={index}
                    onPress={handleHistoryPress}
                  />
                )}
              />
            )
          ) : isEmpty ? (
            <VStack className="flex-1 items-center justify-center">
              <Text className="text-primary-100 text-center">
                {t("app.queue.empty")}
              </Text>
            </VStack>
          ) : editMode ? (
            <DraggableList
              data={localOrder}
              keyExtractor={(item) => item.uid}
              itemHeight={QUEUE_EDIT_ITEM_HEIGHT}
              onSort={handleListSort}
              bottomInset={screenBottomPadding}
              ListHeaderComponent={editHeader}
              contentContainerStyle={{
                paddingBottom: screenBottomPadding,
              }}
              showsVerticalScrollIndicator={false}
              // Rows are only re-rendered when the playing track moves on;
              // a primitive keeps the list's identity check meaningful.
              extraData={playingTrackId}
              renderItem={(item, _index, isActive) =>
                item.kind === "divider" ? (
                  <QueueEditLaneDivider
                    label={contextLabel}
                    isActive={isActive}
                    height={QUEUE_EDIT_ITEM_HEIGHT}
                  />
                ) : (
                  <QueueEditTrackItem
                    item={item.track}
                    isActive={isActive}
                    isPlaying={item.track.id === playingTrackId}
                    onRemovePress={() => handleRemoveFromQueue(item.uid)}
                  />
                )
              }
            />
          ) : (
            <LegendList
              recycleItems
              data={queueRows}
              keyExtractor={(item) => item.key}
              getItemType={(item) => item.kind}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={QueueEndFooter}
              contentContainerStyle={{
                paddingBottom: screenBottomPadding,
              }}
              renderItem={({ item }) => {
                if (item.kind === "header") {
                  return (
                    <Heading
                      size="sm"
                      className="text-gray-300 mt-6 mb-2 px-6"
                      numberOfLines={1}
                    >
                      {item.label}
                    </Heading>
                  );
                }
                return isSpokenWordTrack(item.track) ? (
                  <Box className="px-6">
                    <QueuePodcastListItem
                      track={item.track}
                      index={item.index}
                      onPress={handleQueueItemPress}
                    />
                  </Box>
                ) : (
                  <TrackListItem
                    track={tracks[item.index]}
                    index={item.index}
                    queueIndex={item.index}
                    onSwipeRemove={
                      item.index > (currentIndex ?? -1)
                        ? handleSwipeRemove
                        : undefined
                    }
                    onPress={handleQueueItemPress}
                    disableFirstItemMargin={item.index === currentIndex}
                    className="px-6"
                  />
                );
              }}
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
              {isHistoryTab
                ? t("app.queue.clearHistoryConfirmTitle")
                : t("app.queue.clearConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {isHistoryTab
                ? t("app.queue.clearHistoryConfirmMessage")
                : hasLane
                  ? t("app.queue.clearQueuedConfirmMessage")
                  : t("app.queue.clearConfirmMessage")}
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
                {isHistoryTab
                  ? t("app.queue.clearHistory")
                  : t("app.queue.clear")}
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
    </Box>
  );
}
