import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleCheckBig from "lucide-react-native/icons/circle-check-big";
import EllipsisVertical from "lucide-react-native/icons/ellipsis-vertical";
import Layers from "lucide-react-native/icons/layers";
import Trash from "lucide-react-native/icons/trash";
import UserRound from "lucide-react-native/icons/user-round";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import { audiobookAuthorHref } from "@/components/audiobooks/AudiobookAuthorCard";
import AudiobookCard from "@/components/audiobooks/AudiobookCard";
import AudiobookCover from "@/components/audiobooks/AudiobookCover";
import AudiobookDeleteDialog from "@/components/audiobooks/AudiobookDeleteDialog";
import AudiobookDownloadButton from "@/components/audiobooks/AudiobookDownloadButton";
import AudiobookProgressBar from "@/components/audiobooks/AudiobookProgressBar";
import { audiobookSeriesHref } from "@/components/audiobooks/AudiobookSeriesCard";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import CollapsibleTabs, {
  type CollapsibleSceneProps,
} from "@/components/CollapsibleTabs";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import PlayPauseButton from "@/components/PlayPauseButton";
import RichText from "@/components/RichText";
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
import { VStack } from "@/components/ui/vstack";
import { useAudiobookChapterPlaying } from "@/hooks/audiobookshelf/useAudiobookNowPlaying";
import {
  useAbsBookProgress,
  useAbsItem,
  useAbsMoreLikeThis,
  useAbsProgressMap,
  useSetAudiobookFinished,
} from "@/hooks/audiobookshelf/useAudiobookshelf";
import { useIsPlaying } from "@/hooks/player";
import useImageColors from "@/hooks/useImageColors";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { audiobookCoverUrl } from "@/services/audiobookshelf/keys";
import { playAudiobook } from "@/services/audiobookshelf/play";
import type {
  AbsLibraryItem,
  AbsSeriesRef,
} from "@/services/audiobookshelf/types";
import useAudiobookProgressBase from "@/stores/audiobookProgress";
import useAudiobookshelf from "@/stores/audiobookshelf";
import type { AudiobookChapterSpan } from "@/utils/audiobookTimeline";
import {
  absAuthorName,
  absNarratorName,
  absTitle,
} from "@/utils/audiobookToTrack";
import { formatDuration, formatLongSeconds } from "@/utils/date";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";
import { TOAST_DURATION } from "@/utils/toastDuration";

const APP_BAR_ROW_HEIGHT = 56;
const TAB_BAR_HEIGHT = 48;

function asSeriesList(series: AbsSeriesRef[] | AbsSeriesRef | undefined) {
  if (!series) return [];
  return Array.isArray(series) ? series : [series];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack className="py-2 gap-x-4">
      <Text className="text-primary-100 w-28">{label}</Text>
      <Text className="text-white flex-1">{value}</Text>
    </HStack>
  );
}

export default function AudiobookDetailScreen() {
  const [white, black, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-black",
    "--color-emerald-500",
  ]) as string[];
  const { t } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const screenBottomPadding = useScreenBottomPadding();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: item, error, isLoading } = useAbsItem(id);
  const snapshot = useAudiobookProgressBase((s) => s.books[id]);
  const serverUrl = useAudiobookshelf((s) => s.serverUrl);
  const canDelete = useAudiobookshelf((s) => s.canDelete);
  const isFavorite = useAudiobookshelf((s) =>
    s.favorites.some((f) => f.kind === "book" && f.id === id),
  );
  const toggleFavorite = useAudiobookshelf((s) => s.toggleFavorite);
  const progress = useAbsBookProgress(id);
  const progressMap = useAbsProgressMap();
  const setFinished = useSetAudiobookFinished();
  const moreLikeThis = useAbsMoreLikeThis(item);
  const isPlaying = useIsPlaying();
  const playing = useAudiobookChapterPlaying();
  const isCurrent = playing.itemId === id;
  const [starting, setStarting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<BottomSheetModal>(null);

  const title = item ? absTitle(item) : (snapshot?.title ?? "");
  const author = item ? absAuthorName(item) : (snapshot?.author ?? "");
  const narrator = item ? absNarratorName(item) : (snapshot?.narrator ?? "");
  const metadata = item?.media.metadata;
  const authors = metadata?.authors ?? [];
  const series = asSeriesList(metadata?.series);
  const duration = item?.media.duration ?? snapshot?.duration ?? 0;
  const chapters = useMemo<AudiobookChapterSpan[]>(
    () => item?.media.chapters ?? snapshot?.chapters ?? [],
    [item, snapshot],
  );
  const hasAudio =
    (item?.media.tracks?.length ?? item?.media.numAudioFiles ?? 0) > 0 ||
    !!snapshot;

  const hasCover = item ? !!item.media.coverPath : snapshot?.hasCover !== false;
  const coverUri =
    serverUrl && id && hasCover ? audiobookCoverUrl(serverUrl, id) : undefined;
  const colors = useImageColors(coverUri);
  const topColor =
    (colors?.platform === "ios"
      ? colors.primary
      : colors?.muted === black
        ? colors?.darkVibrant
        : colors?.muted) || black;

  const scrollY = useSharedValue(0);
  const appBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
  }));
  const minTopInset = insets.top + APP_BAR_ROW_HEIGHT;

  const showError = (message: string) => {
    toast.show({
      placement: "top",
      duration: TOAST_DURATION.default,
      render: () => (
        <Toast action="error">
          <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
          <ToastDescription>{message}</ToastDescription>
        </Toast>
      ),
    });
  };

  const start = async (startAt?: number) => {
    if (!id || starting) return;
    setStarting(true);
    try {
      const started = await playAudiobook(id, {
        startAt,
        item: item ?? undefined,
      });
      if (!started) showError(t("app.shared.notAvailableOfflineMessage"));
    } catch {
      showError(t("app.audiobooks.playErrorMessage"));
    } finally {
      setStarting(false);
    }
  };

  const handleToggleFinished = () => {
    menuRef.current?.dismiss();
    if (!id) return;
    setFinished.mutate(
      { itemId: id, finished: !progress?.isFinished },
      { onError: () => showError(t("app.audiobooks.updateErrorMessage")) },
    );
  };

  const navigateFromMenu = (href: Parameters<typeof router.navigate>[0]) => {
    menuRef.current?.dismiss();
    router.navigate(href);
  };

  const remaining =
    progress && !progress.isFinished && progress.currentTime > 0
      ? Math.max(0, (progress.duration || duration) - progress.currentTime)
      : null;

  const renderHeader = () => (
    <LinearGradient
      colors={[topColor, black]}
      locations={[0, 1]}
      style={{ paddingTop: minTopInset, paddingHorizontal: 24 }}
    >
      <VStack className="pt-2 pb-6">
        <HStack className="items-center gap-x-4">
          <AudiobookCover
            itemId={id}
            className="w-32 h-32 bg-primary-800"
            iconSize={24}
          />
          <VStack className="flex-1">
            <Heading
              numberOfLines={3}
              className="text-white font-bold"
              size="xl"
            >
              {title}
            </Heading>
            {authors.length > 0 ? (
              <FadeOutScaleDown
                href={audiobookAuthorHref(authors[0].id, authors[0].name)}
              >
                <Text className="text-white mt-1" numberOfLines={1}>
                  {author}
                </Text>
              </FadeOutScaleDown>
            ) : (
              !!author && (
                <Text className="text-white mt-1" numberOfLines={1}>
                  {author}
                </Text>
              )
            )}
            {!!narrator && (
              <Text className="text-primary-100 text-sm" numberOfLines={1}>
                {t("app.audiobooks.narratedBy", { narrator })}
              </Text>
            )}
          </VStack>
        </HStack>
        {progress && !progress.isFinished && progress.progress > 0 && (
          <VStack className="mt-4 gap-y-1">
            <AudiobookProgressBar progress={progress.progress} />
            {remaining != null && (
              <Text className="text-primary-100 text-sm">
                {t("app.audiobooks.timeLeft", {
                  time: formatDuration(remaining),
                })}
              </Text>
            )}
          </VStack>
        )}
        <FadeOutScaleDown
          onPress={() =>
            id &&
            toggleFavorite({
              kind: "book",
              id,
              name: title,
              subtitle: author,
            })
          }
          className="mt-4 border border-white rounded-full self-start py-1 px-2.5"
        >
          <Text className="text-white">
            {isFavorite
              ? t("app.audiobooks.removeFromFavorites")
              : t("app.audiobooks.addToFavorites")}
          </Text>
        </FadeOutScaleDown>
        <HStack className="mt-4 items-center justify-between">
          <HStack className="items-center gap-x-4">
            {progress?.isFinished && (
              <CircleCheckBig size={24} color={emerald} />
            )}
            {!!id && hasAudio && (
              <AudiobookDownloadButton itemId={id} size={24} />
            )}
            <FadeOutScaleDown
              testID="audiobook-menu-button"
              onPress={() => menuRef.current?.present()}
            >
              <EllipsisVertical color={white} />
            </FadeOutScaleDown>
          </HStack>
          {hasAudio &&
            (starting ? (
              <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                <Spinner color="rgb(41, 41, 41)" />
              </Box>
            ) : (
              <PlayPauseButton
                isPlaying={isCurrent && isPlaying}
                onPress={() => void start()}
                size={48}
                iconSize={24}
                color={white}
                className="bg-emerald-500"
              />
            ))}
        </HStack>
      </VStack>
    </LinearGradient>
  );

  const details = [
    narrator
      ? { label: t("app.audiobooks.details.narrator"), value: narrator }
      : null,
    series.length > 0
      ? {
          label: t("app.audiobooks.details.series"),
          value: series
            .map((s) =>
              s.sequence
                ? t("app.audiobooks.seriesSequence", {
                    series: s.name,
                    sequence: s.sequence,
                  })
                : s.name,
            )
            .join(", "),
        }
      : null,
    metadata?.genres?.length
      ? {
          label: t("app.audiobooks.details.genres"),
          value: metadata.genres.join(", "),
        }
      : null,
    duration > 0
      ? {
          label: t("app.audiobooks.details.duration"),
          value: formatDuration(duration),
        }
      : null,
    metadata?.publishedYear
      ? {
          label: t("app.audiobooks.details.published"),
          value: metadata.publishedYear,
        }
      : null,
    metadata?.publisher
      ? {
          label: t("app.audiobooks.details.publisher"),
          value: metadata.publisher,
        }
      : null,
    metadata?.language
      ? {
          label: t("app.audiobooks.details.language"),
          value: metadata.language,
        }
      : null,
  ].filter((row): row is { label: string; value: string } => !!row);

  const description = metadata?.description || metadata?.descriptionPlain;

  const renderAbout = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <Animated.ScrollView
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      contentContainerStyle={{
        paddingTop: contentTopInset + 24,
        paddingHorizontal: 24,
        paddingBottom: screenBottomPadding,
        minHeight: contentTopInset + 600,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    >
      {error && !snapshot && !isLoading ? (
        <ErrorDisplay error={error} />
      ) : description ? (
        <RichText className="text-white">{description}</RichText>
      ) : (
        <Text className="text-primary-100">
          {t("app.audiobooks.aboutEmpty")}
        </Text>
      )}
      {details.length > 0 && (
        <VStack className="mt-6">
          {details.map((row) => (
            <DetailRow key={row.label} label={row.label} value={row.value} />
          ))}
        </VStack>
      )}
    </Animated.ScrollView>
  );

  const renderChapters = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <AnimatedLegendList
      recycleItems
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      data={chapters}
      extraData={isCurrent ? playing.chapterIndex : -1}
      keyExtractor={(chapter) => String(chapter.start)}
      renderItem={({ item: chapter, index }) => {
        const active = isCurrent && playing.chapterIndex === index;
        return (
          <FadeOutScaleDown onPress={() => void start(chapter.start)}>
            <HStack
              className={cn(
                "px-6 py-3 items-center gap-x-4",
                active && "bg-primary-700",
              )}
            >
              <VStack className="flex-1">
                <Text
                  className={cn(
                    active ? "text-emerald-400 font-bold" : "text-white",
                  )}
                  numberOfLines={2}
                >
                  {chapter.title}
                </Text>
                <Text className="text-primary-100 text-sm">
                  {formatDuration(chapter.end - chapter.start)}
                </Text>
              </VStack>
              <Text className="text-primary-100 text-sm">
                {formatLongSeconds(chapter.start)}
              </Text>
            </HStack>
          </FadeOutScaleDown>
        );
      }}
      ListEmptyComponent={() =>
        isLoading ? null : (
          <Box className="px-6 mt-8">
            <Text className="text-primary-100">
              {t("app.audiobooks.noChapters")}
            </Text>
          </Box>
        )
      }
      contentContainerStyle={{
        paddingTop: contentTopInset,
        paddingBottom: screenBottomPadding,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  const renderMoreLikeThis = ({
    scrollHandler,
    ref,
    contentTopInset,
  }: CollapsibleSceneProps) => (
    <AnimatedLegendList
      recycleItems
      ref={ref}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      data={moreLikeThis.books}
      keyExtractor={(book: AbsLibraryItem) => book.id}
      renderItem={({ item: book }: { item: AbsLibraryItem }) => (
        <AudiobookCard
          itemId={book.id}
          title={absTitle(book)}
          subtitle={absAuthorName(book)}
          progress={progressMap.get(book.id)}
          layout="vertical"
        />
      )}
      ListEmptyComponent={() =>
        moreLikeThis.isLoading ? (
          <Spinner className="mt-8" />
        ) : (
          <Box className="px-6 mt-8">
            <Text className="text-primary-100">
              {t("app.audiobooks.noMoreLikeThis")}
            </Text>
          </Box>
        )
      }
      contentContainerStyle={{
        paddingTop: contentTopInset + 8,
        paddingBottom: screenBottomPadding,
      }}
      scrollIndicatorInsets={{ top: contentTopInset }}
      showsVerticalScrollIndicator={false}
    />
  );

  const tabs = [
    {
      key: "about",
      title: t("app.audiobooks.tabAbout"),
      render: renderAbout,
    },
    {
      key: "chapters",
      title: t("app.audiobooks.tabChapters"),
      render: renderChapters,
    },
    {
      key: "more",
      title: t("app.audiobooks.tabMoreLikeThis"),
      render: renderMoreLikeThis,
    },
  ];

  return (
    <Box className="h-full bg-black">
      <CollapsibleTabs
        tabs={tabs}
        renderHeader={renderHeader}
        tabBarHeight={TAB_BAR_HEIGHT}
        minTopInset={minTopInset}
        scrollY={scrollY}
      />
      <Animated.View
        pointerEvents="box-none"
        className="w-full z-20 absolute top-0 left-0 right-0"
        style={[appBarStyle]}
      >
        <LinearGradient colors={[topColor, black]}>
          <HStack
            className="items-center justify-between pb-4 px-6 bg-black/25"
            style={{ paddingTop: insets.top + 16 }}
          >
            <Box className="w-10" />
            <Heading
              numberOfLines={1}
              className="text-white text-center font-bold truncate flex-1 ml-4"
              size="lg"
            >
              {title}
            </Heading>
            <Box className="w-10" />
          </HStack>
        </LinearGradient>
      </Animated.View>
      <Box
        pointerEvents="box-none"
        className="absolute left-0 right-0 z-30"
        style={{ top: insets.top + 8 }}
      >
        <Box className="px-6">
          <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
            <Box className="w-10 h-10 rounded-full bg-black/40 items-center justify-center">
              <ArrowLeft size={24} color={white} />
            </Box>
          </FadeOutScaleDown>
        </Box>
      </Box>
      <CenteredBottomSheetModal
        ref={menuRef}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ alignItems: "center" }}
        >
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <AudiobookCover
                itemId={id}
                className="w-16 h-16 bg-primary-800"
                iconSize={24}
              />
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {title}
                </Heading>
                {!!author && (
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {author}
                  </Text>
                )}
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              <FadeOutScaleDown
                onPress={handleToggleFinished}
                disabled={setFinished.isPending}
              >
                <HStack className="items-center">
                  <CircleCheck size={24} color={white} />
                  <Text className="ml-4 text-lg text-gray-200">
                    {progress?.isFinished
                      ? t("app.audiobooks.markUnfinished")
                      : t("app.audiobooks.markFinished")}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              {series.map((s) => (
                <FadeOutScaleDown
                  key={s.id}
                  onPress={() =>
                    navigateFromMenu(audiobookSeriesHref(s.id, s.name))
                  }
                >
                  <HStack className="items-center">
                    <Layers size={24} color={white} />
                    <Text
                      className="ml-4 text-lg text-gray-200 flex-1"
                      numberOfLines={1}
                    >
                      {t("app.audiobooks.goToSeries", { series: s.name })}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ))}
              {authors.map((a) => (
                <FadeOutScaleDown
                  key={a.id}
                  onPress={() =>
                    navigateFromMenu(audiobookAuthorHref(a.id, a.name))
                  }
                >
                  <HStack className="items-center">
                    <UserRound size={24} color={white} />
                    <Text
                      className="ml-4 text-lg text-gray-200 flex-1"
                      numberOfLines={1}
                    >
                      {t("app.audiobooks.goToAuthor", { author: a.name })}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              ))}
              {canDelete && !!item && (
                <FadeOutScaleDown
                  onPress={() => {
                    menuRef.current?.dismiss();
                    setDeleteOpen(true);
                  }}
                >
                  <HStack className="items-center">
                    <Trash size={24} color={white} />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.audiobooks.deleteTitle")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
            </VStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>
      {!!item && (
        <AudiobookDeleteDialog
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          itemId={item.id}
          title={title}
          onDeleted={() => goBackOrHome(router)}
        />
      )}
    </Box>
  );
}
