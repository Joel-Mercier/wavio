import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { Child } from "@/services/openSubsonic/types";
import { playTracks } from "@/services/player";
import { artworkUrl } from "@/utils/artwork";
import { childToTrack } from "@/utils/childToTrack";

interface SongCardProps {
  track: Child;
  trackList: Child[];
  index: number;
}

export default function SongCard({ track, trackList, index }: SongCardProps) {
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const handlePress = () => {
    playTracks(trackList.map(childToTrack), index);
  };
  return (
    <FadeOutScaleDown onPress={handlePress} className="mr-6">
      <VStack className="w-32 gap-y-2">
        {track.coverArt ? (
          <Image
            source={{ uri: artworkUrl(track.coverArt) }}
            className="w-32 h-32 rounded-md aspect-square"
            alt="Track cover"
          />
        ) : (
          <Box className="w-32 h-32 aspect-square rounded-md bg-primary-600 items-center justify-center">
            <AudioLines size={48} color={white} />
          </Box>
        )}
        <Heading size="sm" className="text-white" numberOfLines={1}>
          {track.title}
        </Heading>
        <Text numberOfLines={1} className="text-md text-primary-100">
          {track.artist}
        </Text>
      </VStack>
    </FadeOutScaleDown>
  );
}
