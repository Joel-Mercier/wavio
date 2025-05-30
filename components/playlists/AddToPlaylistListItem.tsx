import FadeOut from "@/components/FadeOut";
import { Box } from "@/components/ui/box";
import {
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
} from "@/components/ui/checkbox";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { useGetCoverArt } from "@/hooks/openSubsonic/useMediaRetrieval";
import type { Playlist } from "@/services/openSubsonic/types";
import { Check, ListMusic } from "lucide-react-native";

export default function AddToPlaylistListItem({
  playlist,
  selected,
  onPress,
}: { playlist: Playlist; selected: boolean; onPress: (id: string) => void }) {
  const cover = useGetCoverArt(
    playlist.coverArt,
    { size: 400 },
    !!playlist.coverArt,
  );
  return (
    <FadeOut className="px-6 mb-4" onPress={() => onPress(playlist.id)}>
      <HStack className="items-center justify-between">
        <HStack className="items-center">
          {cover?.data ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${cover?.data}` }}
              className="w-16 h-16 rounded-md aspect-square"
              alt="Playlist cover"
            />
          ) : (
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
              <ListMusic size={24} color={themeConfig.theme.colors.white} />
            </Box>
          )}
          <VStack className="ml-4">
            <Heading className="text-white text-md font-normal">
              {playlist.name}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {playlist.songCount} songs
            </Text>
          </VStack>
        </HStack>
        <Checkbox
          value={playlist.id}
          isChecked={selected}
          onChange={() => onPress(playlist.id)}
          size="lg"
          isInvalid={false}
          isDisabled={false}
          defaultIsChecked={false}
        >
          <CheckboxIndicator className="rounded-full border-2 border-primary-100 data-[checked=true]:bg-emerald-500 data-[checked=true]:border-emerald-500">
            <CheckboxIcon as={Check} className="text-primary-800" />
          </CheckboxIndicator>
        </Checkbox>
      </HStack>
    </FadeOut>
  );
}
