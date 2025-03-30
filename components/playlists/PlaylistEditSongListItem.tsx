import type { Child } from "@/services/openSubsonic/types";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";

export default function PlaylistEditSongListItem({ item }: { item: Child }) {
  return (
    <VStack className="items-center justify-center">
      <Text className="text-white text-md">{item.title}</Text>
    </VStack>
  );
}
