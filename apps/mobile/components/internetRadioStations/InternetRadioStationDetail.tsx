import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/build/react-navigation/bottom-tabs";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import EllipsisVertical from "lucide-react-native/dist/esm/icons/ellipsis-vertical.mjs";
import Languages from "lucide-react-native/dist/esm/icons/languages.mjs";
import MapPin from "lucide-react-native/dist/esm/icons/map-pin.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import SquareArrowOutUpRight from "lucide-react-native/dist/esm/icons/square-arrow-out-up-right.mjs";
import Tag from "lucide-react-native/dist/esm/icons/tag.mjs";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import AnimatedHeart from "@/components/AnimatedHeart";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ImageWithFallback from "@/components/ImageWithFallback";
import InternetRadioStationActions from "@/components/internetRadioStations/InternetRadioStationActions";
import PlayPauseButton from "@/components/PlayPauseButton";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
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
import { useIsPlaying } from "@/hooks/player";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import { pause as pausePlayback, playTracks } from "@/services/player";
import { registerStationClick } from "@/services/radioBrowser/stations";
import { useCurrentAuthScope } from "@/stores/musicFolders";
import useRadioStations, {
  radioFavoritesForScope,
} from "@/stores/radioStations";
import useRecentPlays from "@/stores/recentPlays";
import { goBackOrHome } from "@/utils/navigation";

const titleize = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

// Radio-Browser delivers tags/languages as comma-separated strings; normalize
// the spacing and optionally titleize each entry for display.
const formatList = (
  value: string | undefined,
  transform?: (entry: string) => string,
) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (transform ? transform(entry) : entry))
    .join(", ");

export default function InternetRadioStationDetail() {
  const [blue500, white, gray800, primary100] = Uniwind.getCSSVariable([
    "--color-blue-500",
    "--color-white",
    "--color-gray-800",
    "--color-primary-100",
  ]) as string[];
  const { t } = useTranslation();
  const {
    id,
    streamUrl,
    name,
    homePageUrl,
    imageUrl,
    tags,
    country,
    countrySubdivision,
    languages,
    source = "server",
  } = useLocalSearchParams<{
    id: string;
    streamUrl: string;
    name: string;
    homePageUrl?: string;
    imageUrl?: string;
    tags?: string;
    country?: string;
    countrySubdivision?: string;
    languages?: string;
    source?: "server" | "radioBrowser";
  }>();
  const router = useRouter();
  const toast = useToast();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const addRecentPlay = useRecentPlays((store) => store.addRecentPlay);
  const scope = useCurrentAuthScope();
  // Server-assigned station ids can collide across servers — only a favorite
  // from the active scope counts.
  const isFavorite = useRadioStations((store) =>
    radioFavoritesForScope(store.favoriteRadioStations, scope).some(
      (fav) => fav.id === id,
    ),
  );
  const addFavoriteRadioStation = useRadioStations(
    (store) => store.addFavoriteRadioStation,
  );
  const removeFavoriteRadioStation = useRadioStations(
    (store) => store.removeFavoriteRadioStation,
  );
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const isPlaying = useIsPlaying();
  // Only server stations need homepage scraping for cover art — Radio-Browser
  // (api) stations already provide an image, so skip the network round-trip.
  const meta = useWebsiteMetadata(
    source === "server" && !imageUrl ? homePageUrl : undefined,
  );
  const image = imageUrl || meta.image || meta["twitter:image"];
  const colors = useImageColors(image);

  const isRadioBrowser = source === "radioBrowser";

  // Extra metadata Radio-Browser provides; not available for server stations.
  const tagList = formatList(tags, titleize);
  const locationList = [country, countrySubdivision]
    .filter((value): value is string => !!value)
    .map(titleize)
    .join(", ");
  const languageList = formatList(languages, titleize);
  const hasRadioBrowserInfo =
    isRadioBrowser && (!!tagList || !!locationList || !!languageList);

  const handleToggleFavoritePress = () => {
    if (isFavorite) {
      removeFavoriteRadioStation(id);
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.internetRadioStations.removeFromFavoritesSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    } else {
      addFavoriteRadioStation({
        id,
        name,
        streamUrl,
        homePageUrl,
        imageUrl: image,
        tags,
        country,
        countrySubdivision,
        languages,
        source,
        scope: source === "server" ? scope : undefined,
      });
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.internetRadioStations.addToFavoritesSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
    }
  };

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
      if (isRadioBrowser) {
        // Fire-and-forget click registration for Radio-Browser analytics.
        registerStationClick(id);
      }
      playTracks(
        [
          {
            id,
            url: streamUrl,
            title: name,
            artwork: image,
            artist: homePageUrl,
            isRadio: true,
            streamUrl,
            homePageUrl,
            source,
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
        coverArt: image,
        source,
        tags,
        country,
        countrySubdivision,
        languages,
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
          (colors?.platform === "ios" ? colors.primary : colors?.lightMuted) ||
            blue500,
          "#000000",
        ]}
        className="px-6"
        style={{ paddingTop: insets.top, paddingHorizontal: 24 }}
      >
        <HStack className="mt-6 items-start justify-between">
          <FadeOutScaleDown
            onPress={() => goBackOrHome(router)}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <ArrowLeft size={24} color={white} />
          </FadeOutScaleDown>
          <ImageWithFallback
            source={image ? { uri: image } : undefined}
            className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center"
            alt="Internet radio station cover"
            contentFit="contain"
            fallback={
              <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
                <Radio size={48} color={white} />
              </Box>
            }
          />
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
                <EllipsisVertical color={white} />
              </FadeOutScaleDown>
              <AnimatedHeart
                filled={isFavorite}
                onPress={handleToggleFavoritePress}
              />
            </HStack>
            <HStack className="items-center gap-x-4">
              <PlayPauseButton
                isPlaying={isPlaying}
                onPress={handlePlayPausePress}
                size={48}
                iconSize={24}
                color={white}
                className="bg-emerald-500"
              />
            </HStack>
          </HStack>
        </VStack>
      </LinearGradient>
      <VStack>
        {hasRadioBrowserInfo && (
          <VStack className="px-6 mt-6 gap-y-3">
            {!!tagList && (
              <HStack className="items-center gap-x-3">
                <Tag size={18} color={primary100} />
                <Text className="flex-1 text-md text-primary-100">
                  {tagList}
                </Text>
              </HStack>
            )}
            {!!locationList && (
              <HStack className="items-center gap-x-3">
                <MapPin size={18} color={primary100} />
                <Text className="flex-1 text-md text-primary-100">
                  {locationList}
                </Text>
              </HStack>
            )}
            {!!languageList && (
              <HStack className="items-center gap-x-3">
                <Languages size={18} color={primary100} />
                <Text className="flex-1 text-md text-primary-100">
                  {languageList}
                </Text>
              </HStack>
            )}
          </VStack>
        )}
        {homePageUrl && (
          <Center className="mt-6">
            <FadeOutScaleDown
              className="flex flex-row gap-x-2 items-center justify-center py-3 px-8 border border-white bg-white rounded-full ml-4 mt-4"
              onPress={handleVisitHomePagePress}
            >
              <SquareArrowOutUpRight size={20} color={gray800} />
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
              <ImageWithFallback
                source={image ? { uri: image } : undefined}
                className="w-16 h-16 aspect-square rounded-md bg-primary-800"
                alt="Internet radio station cover"
                contentFit="contain"
                fallback={
                  <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                    <Radio size={24} color={white} />
                  </Box>
                }
              />
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
              source={source}
              isFavorite={isFavorite}
              onToggleFavorite={handleToggleFavoritePress}
              onActionStart={() => bottomSheetModalRef.current?.dismiss()}
              onDeleted={() => goBackOrHome(router)}
            />
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
    </Box>
  );
}
