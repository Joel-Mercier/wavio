import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import TestSlider from "@/components/Slider";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import {
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
} from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import useQueue from "@/stores/queue";
import { artworkUrl } from "@/utils/artwork";
import { downloadUrl } from "@/utils/streaming";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { millisecondsToMinutes } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import {
  AudioLines,
  ChevronDown,
  Download,
  EllipsisVertical,
  Heart,
  ListPlus,
  Pause,
  Play,
  PlusCircle,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  User,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioPro, AudioProState, useAudioPro } from "react-native-audio-pro";

export default function PlayerScreen() {
  const { t } = useTranslation();
  const [showRatingModal, setShowRatingModal] = useState<boolean>(false);
  const [clipboardText, setClipboardText] = useState("");
  const [clipoardCopyDone, setClipoardCopyDone] = useState(false);
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const {
    state,
    position,
    duration,
    playingTrack,
    playbackSpeed,
    volume,
    error,
  } = useAudioPro();
  const colors = useImageColors(playingTrack?.artwork);
  const doFavorite = useStar();
  const doUnfavorite = useUnstar();
  const repeatMode = useQueue((store) => store.repeatMode);
  const setRepeatMode = useQueue((store) => store.setRepeatMode);
  const shuffle = useQueue((store) => store.shuffle);
  const setShuffle = useQueue((store) => store.setShuffle);
  const toast = useToast();
  const [permissionResponse, requestPermission] = MediaLibrary.usePermissions();

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/artists/1");
  };

  const handlePlayPausePress = () => {
    if (state === AudioProState.PLAYING) {
      AudioPro.pause();
    } else {
      AudioPro.resume();
    }
  };

  const handleSliderChange = (value: number) => {
    AudioPro.seekTo(value);
  };

  const handleNextPress = () => {};

  const handlePreviousPress = () => {};

  const handleFavoritePress = () => {
    doFavorite.mutate(
      { id: playingTrack?.id },
      {
        onSuccess: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.favoriteSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.favoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleUnfavoritePress = () => {
    doUnfavorite.mutate(
      { id: playingTrack?.id },
      {
        onSuccess: () => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.unfavoriteSuccessMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
                <ToastDescription>
                  {t("app.tracks.unfavoriteErrorMessage")}
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleRepeatModePress = (newRepeatMode: typeof repeatMode) => {
    setRepeatMode(newRepeatMode);
  };

  const handleShufflePress = (enabled: boolean) => {
    setShuffle(enabled);
  };

  const handleDownloadPress = async () => {
    bottomSheetModalRef.current?.dismiss();
    if (permissionResponse?.status !== "granted") {
      await requestPermission();
    }
    const url = downloadUrl(track.id);
    const destination = new Directory(Paths.cache, "Downloads");
    try {
      destination.create({
        idempotent: true,
        intermediates: true,
      });
      const output = await File.downloadFileAsync(url, destination, {
        idempotent: true,
      });
      if (output.exists) {
        await MediaLibrary.saveToLibraryAsync(output.uri);
        output.delete();
        toast.show({
          placement: "top",
          duration: 3000,
          render: () => (
            <Toast action="success">
              <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
              <ToastDescription>
                {t("app.tracks.downloadSuccessMessage")}
              </ToastDescription>
            </Toast>
          ),
        });
      }
    } catch (error) {
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="error">
            <ToastTitle>{t("app.shared.toastErrorTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.tracks.downloadErrorMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

  return (
    <LinearGradient
      colors={[
        (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
          themeConfig.theme.colors.blue[500],
        "#191A1F",
      ]}
      locations={[0, 0.7]}
    >
      <SafeAreaView>
        <VStack className="px-6 h-screen">
          <HStack className="items-center justify-between my-6">
            <FadeOutScaleDown
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <ChevronDown size={24} color="white" />
            </FadeOutScaleDown>
            <Text className="text-white font-bold uppercase tracking-wider">
              {t("app.player.title")}
            </Text>
            <FadeOutScaleDown
              onPress={handlePresentModalPress}
              className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <EllipsisVertical size={24} color="white" />
            </FadeOutScaleDown>
          </HStack>
          <VStack className="mt-12">
            <HStack className="mb-4">
              {playingTrack?.artwork ? (
                <Image
                  source={{
                    uri: playingTrack?.artwork,
                  }}
                  className="w-full aspect-square rounded-md"
                  alt="cover"
                />
              ) : (
                <Box className="w-full aspect-square rounded-md bg-primary-600 items-center justify-center">
                  <AudioLines
                    size={64}
                    color={themeConfig.theme.colors.white}
                  />
                </Box>
              )}
            </HStack>
            <HStack className="items-center justify-between">
              <VStack className="my-6">
                <Heading className="text-white" size="xl">
                  {playingTrack?.title}
                </Heading>
                <Text className="text-primary-100 text-lg">
                  {playingTrack?.artist}
                </Text>
              </VStack>
              <FadeOut
                onPress={
                  playingTrack?.starred
                    ? handleUnfavoritePress
                    : handleFavoritePress
                }
              >
                <Heart
                  size={24}
                  color={
                    playingTrack?.starred
                      ? themeConfig.theme.colors.emerald[500]
                      : "white"
                  }
                  fill={
                    playingTrack?.starred
                      ? themeConfig.theme.colors.emerald[500]
                      : "transparent"
                  }
                />
              </FadeOut>
            </HStack>
            <VStack className="mb-6">
              <Slider
                defaultValue={0}
                value={position}
                step={1}
                minValue={0}
                maxValue={duration}
                size="md"
                orientation="horizontal"
                isDisabled={false}
                isReversed={false}
                onChange={handleSliderChange}
              >
                <SliderTrack className="bg-primary-400">
                  <SliderFilledTrack className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
                </SliderTrack>
                <SliderThumb className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
              </Slider>
              <Box className="flex-1 h-[50px]" />
              <TestSlider
                value={50}
                onValueChange={(value) => console.log(value)}
                min={0}
                max={100}
                step={5}
                trackClassName="bg-gray-200 rounded-full"
                filledTrackClassName="bg-blue-500 rounded-full"
                thumbClassName="bg-white rounded-full shadow-lg border-2 border-blue-500"
                width={300}
                height={6}
                thumbSize={24}
                accessibilityLabel="Volume control"
                accessibilityHint="Adjust volume by dragging or tapping"
              />
              <HStack className="mt-2 items-center justify-between">
                <Text className="text-primary-100 text-sm">{`${millisecondsToMinutes(position) || 0}:${Math.round(position % 60) || "00"}`}</Text>
                <Text className="text-primary-100 text-sm">
                  {`${millisecondsToMinutes(duration)}:${duration % 60}`}
                </Text>
              </HStack>
            </VStack>
            <HStack className="items-center justify-between">
              <FadeOut onPress={() => handleShufflePress(!shuffle)}>
                {shuffle ? (
                  <>
                    <Shuffle
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                    <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                      <Box className="bg-emerald-500 rounded-full size-1" />
                    </Box>
                  </>
                ) : (
                  <Shuffle size={24} color="white" />
                )}
              </FadeOut>
              <FadeOut onPress={handlePreviousPress}>
                <SkipBack size={36} color="white" fill="white" />
              </FadeOut>
              <FadeOut onPress={handlePlayPausePress}>
                <Box className="h-16 w-16 rounded-full bg-white items-center justify-center">
                  {state === AudioProState.PLAYING ? (
                    <Pause
                      size={24}
                      color={themeConfig.theme.colors.gray[800]}
                      fill={themeConfig.theme.colors.gray[800]}
                    />
                  ) : (
                    <Play
                      size={24}
                      color={themeConfig.theme.colors.gray[800]}
                      fill={themeConfig.theme.colors.gray[800]}
                    />
                  )}
                </Box>
              </FadeOut>
              <FadeOut onPress={handleNextPress}>
                <SkipForward size={36} color="white" fill="white" />
              </FadeOut>
              {repeatMode === "off" && (
                <FadeOut onPress={() => handleRepeatModePress("all")}>
                  <Repeat size={24} color="white" />
                </FadeOut>
              )}
              {repeatMode === "all" && (
                <FadeOut onPress={() => handleRepeatModePress("one")}>
                  <Repeat
                    size={24}
                    color={themeConfig.theme.colors.emerald[500]}
                  />
                  <Box className="absolute left-0 right-0 -bottom-2 flex items-center justify-center">
                    <Box className="bg-emerald-500 rounded-full size-1" />
                  </Box>
                </FadeOut>
              )}
              {repeatMode === "one" && (
                <FadeOut onPress={() => handleRepeatModePress("off")}>
                  <Repeat1
                    size={24}
                    color={themeConfig.theme.colors.emerald[500]}
                  />
                </FadeOut>
              )}
            </HStack>
          </VStack>
        </VStack>
        <BottomSheetModal
          ref={bottomSheetModalRef}
          onChange={handleSheetPositionChange}
          backgroundStyle={{
            backgroundColor: "rgb(41, 41, 41)",
          }}
          handleIndicatorStyle={{
            backgroundColor: "#b3b3b3",
          }}
          backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
        >
          <BottomSheetView
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
            <Box className="p-6 w-full mb-12">
              <HStack className="items-center">
                {playingTrack?.artwork ? (
                  <Image
                    source={{
                      uri: playingTrack?.artwork,
                    }}
                    className="w-16 h-16 rounded-md aspect-square"
                    alt="Track cover"
                  />
                ) : (
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <AudioLines
                      size={24}
                      color={themeConfig.theme.colors.white}
                    />
                  </Box>
                )}
                <VStack className="ml-4">
                  <Heading
                    className="text-white font-normal"
                    size="lg"
                    numberOfLines={1}
                  >
                    {playingTrack?.title}
                  </Heading>
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    {playingTrack?.artist} ⦁ {playingTrack?.album}
                  </Text>
                </VStack>
              </HStack>
              <VStack className="mt-6 gap-y-8">
                <FadeOutScaleDown>
                  <HStack className="items-center">
                    <PlusCircle
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.addToPlaylist")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleGoToArtistPress}>
                  <HStack className="items-center">
                    <User
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.goToArtist")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown>
                  <HStack className="items-center">
                    <ListPlus
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.addToQueue")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={() => console.log("share pressed")}>
                  <HStack className="items-center">
                    <Share2
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.share")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={handleDownloadPress}>
                  <HStack className="items-center">
                    <Download
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      {t("app.tracks.download")}
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            </Box>
          </BottomSheetView>
        </BottomSheetModal>
      </SafeAreaView>
    </LinearGradient>
  );
}
