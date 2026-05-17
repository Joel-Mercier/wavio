import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import CircleMinus from "lucide-react-native/dist/esm/icons/circle-minus.mjs";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import type { OfflineTrack } from "@/stores/offline";
import { artworkUrl } from "@/utils/artwork";
import { niceBytes } from "@/utils/fileSize";

interface OfflineDownloadItemProps {
  item: OfflineTrack;
  onRemovePress: () => void;
}

export default function OfflineDownloadItem({
  item,
  onRemovePress,
}: OfflineDownloadItemProps) {
  const [white, gray400] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-400",
  ]) as string[];

  return (
    <HStack className="items-center justify-between mb-4">
      <HStack className="items-center flex-1 mr-2">
        <FadeOutScaleDown className="mr-4" onPress={onRemovePress}>
          <CircleMinus size={24} color={gray400} />
        </FadeOutScaleDown>
        {item.coverArt ? (
          <Image
            source={{ uri: artworkUrl(item.coverArt) }}
            className="w-16 h-16 rounded-md aspect-square"
            alt="Track cover"
          />
        ) : (
          <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
            <AudioLines size={24} color={white} />
          </Box>
        )}
        <VStack className="ml-4 flex-1">
          <Heading
            className="text-white text-md font-normal capitalize"
            numberOfLines={1}
          >
            {item.title}
          </Heading>
          <Text className="text-primary-100 text-sm" numberOfLines={1}>
            {item.artist}
          </Text>
          <Text className="text-primary-100 text-xs">
            {niceBytes(item.size)}
          </Text>
        </VStack>
      </HStack>
    </HStack>
  );
}
