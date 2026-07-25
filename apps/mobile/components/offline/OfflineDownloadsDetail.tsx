import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse from "fuse.js";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import OfflineDownloadItem from "@/components/offline/OfflineDownloadItem";
import SortOptionsSheet, {
  useSortFieldLabel,
} from "@/components/SortOptionsSheet";
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
import { Input, InputField, InputIcon, InputSlot } from "@/components/ui/input";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import {
  useDownloadedTracksList,
  useOfflineDownloads,
  useTotalDownloadSize,
} from "@/hooks/offline";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp from "@/stores/app";
import type { OfflineTrack } from "@/stores/offline";
import { niceBytes } from "@/utils/fileSize";
import { goBackOrHome } from "@/utils/navigation";
import {
  availableSortFields,
  effectiveSort,
  parseSortType,
  sortItems,
} from "@/utils/sort";
import { cn } from "@/utils/tailwind";
import {
  OFFLINE_TRACK_SORT_FIELDS,
  OFFLINE_TRACK_SORT_SPECS,
  trackSortEnabled,
} from "@/utils/trackSort";

export default function OfflineDownloadsDetail() {
  const [gray500, white, primary50, primary800] = Uniwind.getCSSVariable([
    "--color-gray-500",
    "--color-white",
    "--color-primary-50",
    "--color-primary-800",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const sort = useApp((s) => s.downloadsSort);
  const setDownloadsSort = useApp((s) => s.setDownloadsSort);
  const { removeDownloadedTrack, clearAllDownloads } = useOfflineDownloads();
  const downloadedTracksList = useDownloadedTracksList();
  const totalDownloadSize = useTotalDownloadSize();

  const bottomSheetSortModalRef = useRef<BottomSheetModal>(null);
  const listRef = useRef<FlashListRef<OfflineTrack>>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearProgress, setClearProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const form = useForm({
    defaultValues: {
      query: "",
    },
  });
  const query = useSelector(form.store, (state) => state.values.query);
  const handleSearchClearPress = () => {
    form.setFieldValue("query", "");
  };

  const capabilities = useCapabilities();
  const sortFields = useMemo(
    () =>
      availableSortFields(
        downloadedTracksList,
        OFFLINE_TRACK_SORT_SPECS,
        OFFLINE_TRACK_SORT_FIELDS,
        trackSortEnabled(capabilities),
      ),
    [downloadedTracksList, capabilities],
  );
  // Downloads saved before the store kept year/genre/album artist can't offer
  // those sorts; fall back to alphabetical without dropping the preference.
  const activeSort = effectiveSort(sort, sortFields, "alphabeticalAsc");
  const activeSortField = parseSortType(activeSort).field;
  const sortFieldLabel = useSortFieldLabel();

  const data = useMemo(() => {
    const sorted = sortItems(
      downloadedTracksList,
      activeSort,
      OFFLINE_TRACK_SORT_SPECS,
    );
    if (query.length === 0) {
      return sorted;
    }
    const fuse = new Fuse<OfflineTrack>(sorted, {
      includeScore: true,
      ignoreDiacritics: true,
      keys: ["title", "artist", "album"],
    });
    return fuse.search(query).map((result) => result.item);
  }, [downloadedTracksList, activeSort, query]);

  // A changed sort/query reorders the list; snap back to the top so the new
  // ordering starts in view instead of leaving the user mid-scroll.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeSort, query]);

  const isEmpty = downloadedTracksList.length === 0;

  const handlePresentSortModalPress = () => {
    bottomSheetSortModalRef.current?.present();
  };

  const handleClearAllPress = async () => {
    setIsClearing(true);
    setClearProgress({ done: 0, total: 0 });
    try {
      await clearAllDownloads((done, total) =>
        setClearProgress({ done, total }),
      );
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.offlineSettings.clearDownloadsSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.settings.offlineSettings.clearDownloadsErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } finally {
      setIsClearing(false);
      setClearProgress(null);
      setShowClearConfirm(false);
    }
  };

  const handleRemovePress = async (trackId: string) => {
    try {
      await removeDownloadedTrack(trackId);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } catch {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.removeOfflineDownloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

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
            {t("app.offlineDownloads.title")}
          </Heading>
          <Box className="w-6" />
        </HStack>
        <HStack className="items-center justify-between px-6 mb-4">
          <VStack>
            <Text className="text-white font-bold">
              {t("app.offlineDownloads.totalTracks", {
                count: downloadedTracksList.length,
              })}
            </Text>
            <Text className="text-primary-100 text-sm">
              {t("app.offlineDownloads.totalSize", {
                size: niceBytes(totalDownloadSize),
              })}
            </Text>
          </VStack>
          <FadeOutScaleDown
            onPress={isEmpty ? undefined : () => setShowClearConfirm(true)}
          >
            <HStack className="items-center gap-x-2">
              <Trash2
                size={16}
                color={isEmpty ? iconDisabledColor : iconActiveColor}
              />
              <Text className="text-white font-bold">
                {t("app.offlineDownloads.clearAll")}
              </Text>
            </HStack>
          </FadeOutScaleDown>
        </HStack>
        {!isEmpty && (
          <VStack className="px-6 mb-4 gap-y-4">
            <form.Field name="query">
              {(field) => (
                <Input className="border-0 bg-primary-600 rounded-lg h-10 px-2">
                  <InputSlot className="pl-2">
                    <InputIcon as={Search} className="text-primary-100" />
                  </InputSlot>
                  <InputField
                    disableFullscreenUI
                    className="text-white"
                    placeholder={t("app.offlineDownloads.searchPlaceholder")}
                    placeholderTextColor={primary50}
                    type="text"
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    enterKeyHint="search"
                  />
                  {field.state.value.length > 0 && (
                    <InputSlot
                      className="pr-2"
                      onPress={handleSearchClearPress}
                    >
                      <InputIcon as={X} size="xl" />
                    </InputSlot>
                  )}
                </Input>
              )}
            </form.Field>
            <FadeOutScaleDown onPress={handlePresentSortModalPress}>
              <HStack className="items-center gap-x-2">
                {activeSort.endsWith("Desc") ? (
                  <ArrowDown size={16} color={white} />
                ) : (
                  <ArrowUp size={16} color={white} />
                )}
                <Text className="text-white font-bold">
                  {sortFieldLabel(activeSortField)}
                </Text>
              </HStack>
            </FadeOutScaleDown>
          </VStack>
        )}
        <Box className="px-6 flex-1">
          {isEmpty ? (
            <VStack className="flex-1 items-center justify-center">
              <Text className="text-primary-100 text-center">
                {t("app.offlineDownloads.empty")}
              </Text>
            </VStack>
          ) : (
            <FlashList
              ref={listRef}
              data={data}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: screenBottomPadding,
              }}
              ListEmptyComponent={<EmptyDisplay />}
              renderItem={({ item }) => (
                <OfflineDownloadItem
                  item={item}
                  onRemovePress={() => handleRemovePress(item.id)}
                />
              )}
            />
          )}
        </Box>
      </Box>
      <SortOptionsSheet
        ref={bottomSheetSortModalRef}
        fields={sortFields}
        sort={activeSort}
        onSelect={setDownloadsSort}
      />
      <AlertDialog
        isOpen={showClearConfirm}
        onClose={() => {
          if (isClearing) return;
          setShowClearConfirm(false);
        }}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.settings.offlineSettings.clearDownloadsConfirmTitle")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              {t(
                "app.settings.offlineSettings.clearDownloadsConfirmDescription",
              )}
            </Text>
          </AlertDialogBody>
          <VStack className="gap-y-4">
            {isClearing && (
              <VStack className="gap-y-2">
                <Text className="text-primary-100 text-sm text-center">
                  {t("app.offlineDownloads.deleting", {
                    done: clearProgress?.done ?? 0,
                    total: clearProgress?.total ?? 0,
                  })}
                </Text>
                <Progress
                  value={
                    clearProgress && clearProgress.total > 0
                      ? Math.round(
                          (clearProgress.done / clearProgress.total) * 100,
                        )
                      : 0
                  }
                  className="bg-primary-600"
                >
                  <ProgressFilledTrack className="bg-emerald-500" />
                </Progress>
              </VStack>
            )}
            <AlertDialogFooter className="items-center justify-center">
              <FadeOutScaleDown
                onPress={
                  isClearing ? undefined : () => setShowClearConfirm(false)
                }
                className={cn(
                  "items-center justify-center py-3 px-8 border border-white rounded-full mr-4",
                  isClearing && "opacity-50",
                )}
              >
                <Text className="text-white font-bold text-lg">
                  {t("app.shared.cancel")}
                </Text>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={isClearing ? undefined : handleClearAllPress}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
              >
                {isClearing ? (
                  <Spinner color={primary800} />
                ) : (
                  <Text className="text-primary-800 font-bold text-lg">
                    {t("app.shared.delete")}
                  </Text>
                )}
              </FadeOutScaleDown>
            </AlertDialogFooter>
          </VStack>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
