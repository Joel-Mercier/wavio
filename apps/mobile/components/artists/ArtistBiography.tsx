import { useLocalSearchParams, useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RichText from "@/components/RichText";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import useApp from "@/stores/app";
import { goBackOrHome } from "@/utils/navigation";
import { cn } from "@/utils/tailwind";

export default function ArtistBiography() {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const isWideLayout = useApp((s) => s.isWideLayout);
  const { name, biography, musicBrainzId, lastFmUrl } = useLocalSearchParams<{
    name: string;
    biography: string;
    musicBrainzId: string;
    lastFmUrl: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleLastFMPress = async () => {
    if (
      name &&
      (await Linking.canOpenURL(
        `https://www.last.fm/music/${encodeURIComponent(name)}`,
      ))
    ) {
      Linking.openURL(`https://www.last.fm/music/${encodeURIComponent(name)}`);
    }
  };

  const handleMusicBrainzPress = async () => {
    if (
      name &&
      (await Linking.canOpenURL(
        `https://musicbrainz.org/artist/${musicBrainzId}`,
      ))
    ) {
      Linking.openURL(`https://musicbrainz.org/artist/${musicBrainzId}`);
    }
  };

  return (
    <Box className={cn("px-6 pb-6 h-full", isWideLayout ? "mb-6" : "mt-6")}>
      <HStack
        className="items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => goBackOrHome(router)}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white text-center truncate flex-1" size="lg">
          {name}
        </Heading>
        <Box className="w-6" />
      </HStack>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: screenBottomPadding,
        }}
      >
        <RichText className="text-white mt-6">{biography}</RichText>
        <FadeOutScaleDown
          onPress={handleMusicBrainzPress}
          className="flex flex-row items-center my-6"
        >
          <MusicBrainz width={24} height={24} fill="white" />
          <Text className="text-white ml-4 text-lg">
            {t("app.artists.musicBrainz")}
          </Text>
        </FadeOutScaleDown>
        <FadeOutScaleDown
          onPress={handleLastFMPress}
          className="flex flex-row items-center"
        >
          <LastFM width={24} height={24} fill="white" />
          <Text className="text-white ml-4 text-lg">
            {t("app.artists.lastFM")}
          </Text>
        </FadeOutScaleDown>
      </ScrollView>
    </Box>
  );
}
