import LastFM from "@/assets/images/lastfm.svg";
import MusicBrainz from "@/assets/images/musicbrainz.svg";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";

export default function ArtistBiography() {
  const { t } = useTranslation();
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
    <Box className="px-6 mt-6 pb-6 h-full">
      <HStack
        className="items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <FadeOutScaleDown onPress={() => router.back()}>
          <ArrowLeft size={24} color="white" />
        </FadeOutScaleDown>
        <Heading className="text-white" size="xl">
          {name}
        </Heading>
        <Box className="w-6" />
      </HStack>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: insets.bottom + FLOATING_PLAYER_HEIGHT,
        }}
      >
        <Text className="text-white mt-6">{biography}</Text>
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
