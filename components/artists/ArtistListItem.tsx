import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { Image } from "@/components/ui/image";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { Link } from "expo-router";
import { User } from "lucide-react-native";

export default function ArtistListItem() {
  return (
    <Link href="/artists/1" className="mr-6">
      <VStack className="gap-y-2 w-32">
        <Image
          source={require("@/assets/images/covers/gunship-unicorn.jpg")}
          className="w-32 h-32 rounded-full aspect-square"
          alt="Artist cover"
        />
        <Box className="w-32 h-32 rounded-full bg-primary-600 items-center justify-center">
          <User size={48} color={themeConfig.theme.colors.white} />
        </Box>
        <Heading size="sm" className="text-white" numberOfLines={1}>
          Gunship
        </Heading>
        <Text numberOfLines={2} className="text-md text-primary-100">
          Artist
        </Text>
      </VStack>
    </Link>
  );
}
