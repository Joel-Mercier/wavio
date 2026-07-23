import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useForm, useSelector } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import Fuse from "fuse.js";
import ArrowDown from "lucide-react-native/dist/esm/icons/arrow-down.mjs";
import ArrowDownUp from "lucide-react-native/dist/esm/icons/arrow-down-up.mjs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import ArrowUp from "lucide-react-native/dist/esm/icons/arrow-up.mjs";
import Search from "lucide-react-native/dist/esm/icons/search.mjs";
import Trash2 from "lucide-react-native/dist/esm/icons/trash-2.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import OfflineDownloadItem from "@/components/offline/OfflineDownloadItem";
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
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp, { type DownloadsSort } from "@/stores/app";
import type { OfflineTrack } from "@/stores/offline";
import { niceBytes } from "@/utils/fileSize";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

const byTitle = (a: OfflineTrack, b: OfflineTrack) =>
  a.title.localeCompare(b.title);

const sortTracks = (tracks: OfflineTrack[], sort: DownloadsSort) => {
  switch (sort) {
    case "alphabeticalAsc":
      return tracks.sort(byTitle);
    case "alphabeticalDesc":
      return tracks.sort((a, b) => byTitle(b, a));
    case "artistAsc":
      return tracks.sort(
        (a, b) =>
          (a.artist || "").localeCompare(b.artist || "") ||
          (a.album || "").localeCompare(b.album || "") ||
          (a.track ?? 0) - (b.track ?? 0) ||
          byTitle(a, b),
      );
    case "artistDesc":
      return tracks.sort(
        (a, b) =>
          (b.artist || "").localeCompare(a.artist || "") ||
          (a.album || "").localeCompare(b.album || "") ||
          (a.track ?? 0) - (b.track ?? 0) ||
          byTitle(a, b),
      );
    case "albumAsc":
      return tracks.sort(
        (a, b) =>
          (a.album || "").localeCompare(b.album || "") ||
          (a.track ?? 0) - (b.track ?? 0) ||
          byTitle(a, b),
      );
    case "albumDesc":
      return tracks.sort(
        (a, b) =>
          (b.album || "").localeCompare(a.album || "") ||
          (a.track ?? 0) - (b.track ?? 0) ||
          byTitle(a, b),
      );
    case "sizeAsc":
      return tracks.sort((a, b) => a.size - b.size);
    case "sizeDesc":
      return tracks.sort((a, b) => b.size - a.size);
    default:
      return tracks;
  }
};

export default function OfflineDownloadsDetail() {
  const [gray500, white, primary50, emerald500, primary800] =
    Uniwind.getCSSVariable([
      "--color-gray-500",
      "--color-white",
      "--color-primary-50",
      "--color-emerald-500",
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

  const data = useMemo(() => {
    const sorted = sortTracks([...downloadedTracksList], sort);
    if (query.length === 0) {
      return sorted;
    }
    const fuse = new Fuse<OfflineTrack>(sorted, {
      includeScore: true,
      ignoreDiacritics: true,
      keys: ["title", "artist", "album"],
    });
    return fuse.search(query).map((result) => result.item);
  }, [downloadedTracksList, sort, query]);

  // A changed sort/query reorders the list; snap back to the top so the new
  // ordering starts in view instead of leaving the user mid-scroll.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [sort, query]);

  const isEmpty = downloadedTracksList.length === 0;

  const handlePresentSortModalPress = () => {
    bottomSheetSortModalRef.current?.present();
  };

  const handleSortPress = (type: DownloadsSort) => {
    bottomSheetSortModalRef.current?.dismiss();
    setDownloadsSort(type);
  };

  const sortLabel = sort.startsWith("artist")
    ? t("app.library.artistSort")
    : sort.startsWith("album")
      ? t("app.library.albumSort")
      : sort.startsWith("size")
        ? t("app.library.sizeSort")
        : t("app.library.alphabeticalSort");

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
                {sort.endsWith("Asc") && <ArrowUp size={16} color={white} />}
                {sort.endsWith("Desc") && <ArrowDown size={16} color={white} />}
                {!sort.endsWith("Asc") && !sort.endsWith("Desc") && (
                  <ArrowDownUp size={16} color={white} />
                )}
                <Text className="text-white font-bold">{sortLabel}</Text>
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
      <CenteredBottomSheetModal
        ref={bottomSheetSortModalRef}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
      >
        <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
          <Box className="p-6 w-full mb-12">
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "alphabeticalAsc"
                      ? "alphabeticalDesc"
                      : "alphabeticalAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {t("app.library.alphabeticalSort")}
                  </Text>
                  {sort === "alphabeticalAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "alphabeticalDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "artistAsc" ? "artistDesc" : "artistAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {t("app.library.artistSort")}
                  </Text>
                  {sort === "artistAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "artistDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(
                    sort === "albumAsc" ? "albumDesc" : "albumAsc",
                  )
                }
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {t("app.library.albumSort")}
                  </Text>
                  {sort === "albumAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "albumDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown
                onPress={() =>
                  handleSortPress(sort === "sizeAsc" ? "sizeDesc" : "sizeAsc")
                }
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {t("app.library.sizeSort")}
                  </Text>
                  {sort === "sizeAsc" && (
                    <ArrowUp size={24} color={emerald500} />
                  )}
                  {sort === "sizeDesc" && (
                    <ArrowDown size={24} color={emerald500} />
                  )}
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
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
