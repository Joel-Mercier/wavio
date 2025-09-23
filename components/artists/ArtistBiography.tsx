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
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ArtistBiography() {
  const { name, biography, musicBrainzId, lastFmUrl } = useLocalSearchParams<{
    name: string;
    biography: string;
    musicBrainzId: string;
    lastFmUrl: string;
  }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
      <ScrollView>
        <Text className="text-white mt-6">{biography}</Text>
        <FadeOutScaleDown className="flex flex-row items-center my-6">
          <MusicBrainz width={24} height={24} fill="white" />
          <Text className="text-white ml-4 text-lg">Open in MusicBrainz</Text>
        </FadeOutScaleDown>
        <FadeOutScaleDown className="flex flex-row items-center">
          <LastFM width={24} height={24} fill="white" />
          <Text className="text-white ml-4 text-lg">Open in Last.fm</Text>
        </FadeOutScaleDown>
      </ScrollView>
    </Box>
  );
}
