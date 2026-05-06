import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  EllipsisVertical,
  Pause,
  Play,
  Radio,
  SquareArrowOutUpRight,
} from "lucide-react-native";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import InternetRadioStationActions from "@/components/internetRadioStations/InternetRadioStationActions";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useIsPlaying } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import { pause as pausePlayback, playTracks } from "@/services/player";
import useRecentPlays from "@/stores/recentPlays";

export default function InternetRadioStationDetail() {
  const { t } = useTranslation();
  const { id, streamUrl, name, homePageUrl } = useLocalSearchParams<{
    id: string;
    streamUrl: string;
    name: string;
    homePageUrl?: string;
  }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const isPlaying = useIsPlaying();
  const meta = useWebsiteMetadata(homePageUrl);
  const colors = useImageColors(meta.image || meta["twitter:image"]);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleVisitHomePagePress = async () => {
    if (homePageUrl && (await Linking.canOpenURL(homePageUrl))) {
      Linking.openURL(homePageUrl);
    }
    bottomSheetModalRef.current?.dismiss();
  };

  const handlePlayPausePress = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      playTracks(
        [
          {
            id,
            url: streamUrl,
            title: name,
            artwork: meta.image || meta["twitter:image"],
            artist: homePageUrl,
            isRadio: true,
            streamUrl,
            homePageUrl,
          },
        ],
        0,
      );
      addRecentPlay({
        id,
        title: name,
        type: "internetRadioStation",
        homePageUrl,
        streamUrl,
        coverArt: meta.image || meta["twitter:image"],
      });
    }
  };

  return (
    <Box
      className="h-full w-full"
      style={{
        paddingBottom: insets.bottom + bottomTabBarHeight,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <LinearGradient
        colors={[
          (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
            themeConfig.theme.colors.blue[500],
          "#000000",
        ]}
        className="px-6"
        style={{ paddingTop: insets.top, paddingHorizontal: 24 }}
      >
        <HStack className="mt-6 items-start justify-between">
          <FadeOutScaleDown
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
          </FadeOutScaleDown>
          {meta.image || meta["twitter:image"] ? (
            <Image
              source={{ uri: meta.image || meta["twitter:image"] }}
              className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center"
              alt="Internet radio station cover"
              contentFit="contain"
            />
          ) : (
            <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Radio size={48} color={themeConfig.theme.colors.white} />
            </Box>
          )}
          <Box className="w-10" />
        </HStack>
        <VStack>
          <HStack className="mt-5 items-center justify-between">
            <Heading numberOfLines={1} className="text-white" size="2xl">
              {name}
            </Heading>
          </HStack>
          <HStack className="mt-4 items-center justify-between">
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown onPress={handlePresentModalPress}>
                <EllipsisVertical color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
            </HStack>
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown onPress={handlePlayPausePress}>
                <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                  {isPlaying ? (
                    <Pause
                      color={themeConfig.theme.colors.white}
                      fill={themeConfig.theme.colors.white}
                    />
                  ) : (
                    <Play
                      color={themeConfig.theme.colors.white}
                      fill={themeConfig.theme.colors.white}
                    />
                  )}
                </Box>
              </FadeOutScaleDown>
            </HStack>
          </HStack>
        </VStack>
      </LinearGradient>
      <VStack>
        {homePageUrl && (
          <Center className="mt-6">
            <FadeOutScaleDown
              className="flex flex-row gap-x-2 items-center justify-center py-3 px-8 border border-white bg-white rounded-full ml-4 mt-4"
              onPress={handleVisitHomePagePress}
            >
              <SquareArrowOutUpRight
                size={20}
                color={themeConfig.theme.colors.gray[800]}
              />
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.internetRadioStations.visitHomePage")}
              </Text>
            </FadeOutScaleDown>
          </Center>
        )}
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
              <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                <Radio size={24} color={themeConfig.theme.colors.white} />
              </Box>
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {streamUrl}
                </Text>
              </VStack>
            </HStack>
            <InternetRadioStationActions
              id={id}
              name={name}
              streamUrl={streamUrl}
              homePageUrl={homePageUrl}
              onActionStart={() => bottomSheetModalRef.current?.dismiss()}
              onDeleted={() => router.back()}
            />
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
