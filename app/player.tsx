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
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  AudioLines,
  ChevronDown,
  EllipsisVertical,
  Heart,
  ListPlus,
  Play,
  PlusCircle,
  Repeat,
  Share,
  Shuffle,
  SkipBack,
  SkipForward,
  User,
} from "lucide-react-native";
import { useCallback, useRef } from "react";

export default function PlayerScreen() {
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleGoToArtistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/artists/1");
  };

  return (
    <LinearGradient
      colors={[themeConfig.theme.colors.blue[500], "#191A1F"]}
      locations={[0, 0.8]}
    >
      <SafeAreaView>
        <ScrollView>
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
                <Image
                  source={require("@/assets/images/covers/gunship-unicorn.jpg")}
                  className="w-full aspect-square rounded-md"
                  alt="cover"
                />
              </HStack>
              <HStack className="items-center justify-between">
                <VStack className="my-6">
                  <Heading className="text-white" size="xl">
                    Unicorn
                  </Heading>
                  <Text className="text-primary-100 text-lg">Artist</Text>
                </VStack>
                <FadeOut>
                  <Heart
                    size={24}
                    fill={themeConfig.theme.colors.emerald[500]}
                  />
                </FadeOut>
              </HStack>
              <VStack className="mb-6">
                <Slider
                  defaultValue={30}
                  size="md"
                  orientation="horizontal"
                  isDisabled={false}
                  isReversed={false}
                >
                  <SliderTrack className="bg-primary-400">
                    <SliderFilledTrack className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
                  </SliderTrack>
                  <SliderThumb className="bg-white data-[focus=true]:bg-white data-[active=true]:bg-white" />
                </Slider>
                <HStack className="mt-2 items-center justify-between">
                  <Text className="text-primary-100 text-sm">0:30</Text>
                  <Text className="text-primary-100 text-sm">2:45</Text>
                </HStack>
              </VStack>
              <HStack className="items-center justify-between">
                <FadeOut>
                  <Shuffle size={24} color="white" />
                </FadeOut>
                <FadeOut>
                  <SkipBack size={36} color="white" fill="white" />
                </FadeOut>
                <FadeOut>
                  <Box className="h-16 w-16 rounded-full bg-white items-center justify-center">
                    <Play
                      size={24}
                      color={themeConfig.theme.colors.gray[800]}
                      fill={themeConfig.theme.colors.gray[800]}
                    />
                  </Box>
                </FadeOut>
                <FadeOut>
                  <SkipForward size={36} color="white" fill="white" />
                </FadeOut>
                <FadeOut>
                  <Repeat size={24} color="white" />
                </FadeOut>
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
                {true ? (
                  <Image
                    source={require("@/assets/images/covers/gunship-unicorn.jpg")}
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
                    <Share
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
