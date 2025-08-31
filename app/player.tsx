import FadeOut from "@/components/FadeOut";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useStar, useUnstar } from "@/hooks/openSubsonic/useMediaAnnotation";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { secondsToMinutes } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  AudioLines,
  ChevronDown,
  EllipsisVertical,
  Heart,
  ListPlus,
  Pause,
  Play,
  PlusCircle,
  Repeat,
  Repeat1,
  Repeat2,
  Share,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  User,
} from "lucide-react-native";
import { useCallback, useMemo, useRef } from "react";
import { AudioPro, AudioProState, useAudioPro } from "react-native-audio-pro";

export default function PlayerScreen() {
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
  const toast = useToast();

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
                <ToastDescription>
                  Track successfully added to favorites
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
                <ToastDescription>
                  An error occurred while adding track to favorites
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
                <ToastDescription>
                  Track successfully removed from favorites
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
                <ToastDescription>
                  An error occurred while removing the track from favorites
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleRepeatModePress = (repeatMode: any) => {};

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
        <ScrollView showsVerticalScrollIndicator={false}>
          <VStack className="px-6 h-screen">
            <HStack className="items-center justify-between my-6">
              <FadeOutScaleDown onPress={() => router.back()}>
                <ChevronDown size={24} color="white" />
              </FadeOutScaleDown>
              <Text className="text-white font-bold uppercase tracking-wider">
                Playing now
              </Text>
              <FadeOutScaleDown onPress={handlePresentModalPress}>
                <EllipsisVertical size={24} color="white" />
              </FadeOutScaleDown>
            </HStack>
            <VStack className="mt-12">
              <HStack className="mb-4">
                {playingTrack?.artwork ? (
                  <Image
                    source={{
                      // uri: `data:image/jpeg;base64,${playingTrack?.artwork}`,
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
                <HStack className="mt-2 items-center justify-between">
                  <Text className="text-primary-100 text-sm">{`${secondsToMinutes(position) || 0}:${Math.round(position % 60) || "00"}`}</Text>
                  <Text className="text-primary-100 text-sm">
                    {`${secondsToMinutes(duration)}:${duration % 60}`}
                  </Text>
                </HStack>
              </VStack>
              <HStack className="items-center justify-between">
                <FadeOut>
                  <Shuffle size={24} color="white" />
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
                {/* {repeatMode === RepeatMode.Off && (
                  <FadeOut
                    onPress={() => handleRepeatModePress(RepeatMode.Queue)}
                  >
                    <Repeat size={24} color="white" />
                  </FadeOut>
                )}
                {repeatMode === RepeatMode.Queue && (
                  <FadeOut
                    onPress={() => handleRepeatModePress(RepeatMode.Track)}
                  >
                    <Repeat2
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  </FadeOut>
                )}
                {repeatMode === RepeatMode.Track && (
                  <FadeOut
                    onPress={() => handleRepeatModePress(RepeatMode.Off)}
                  >
                    <Repeat1
                      size={24}
                      color={themeConfig.theme.colors.emerald[500]}
                    />
                  </FadeOut>
                )} */}
              </HStack>
            </VStack>
          </VStack>
        </ScrollView>
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
            <Box className="p-6 w-full pb-12">
              <HStack className="items-center">
                {playingTrack?.artwork ? (
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${playingTrack?.artwork}`,
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
                    Unicorn
                  </Heading>
                  <Text numberOfLines={1} className="text-md text-primary-100">
                    Gunship ⦁ Album
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
                      Add to playlist
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
                      Go to artist
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
                      Add to queue
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
                <FadeOutScaleDown onPress={() => console.log("share pressed")}>
                  <HStack className="items-center">
                    <Share2
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">Share</Text>
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
