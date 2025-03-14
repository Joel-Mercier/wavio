import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { Link } from "expo-router";
import { ListMusic } from "lucide-react-native";

export default function PlaylistListItem() {
  return (
    <Link href="/playlists/1" className="mr-6">
      <VStack className="gap-y-2 w-32">
        <Image
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          className="w-32 h-32 rounded-md"
          alt="Playlist cover"
        />
        <Box className="w-32 h-32 rounded-md bg-primary-600 items-center justify-center">
          <ListMusic size={48} color={themeConfig.theme.colors.white} />
        </Box>
        <Heading size="sm" className="text-white" numberOfLines={1}>
          My awesome playlist
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          Playlist
        </Text>
      </VStack>
    </Link>
  );
}
