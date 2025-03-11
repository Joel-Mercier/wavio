import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { SafeAreaView } from "@/components/ui/safe-area-view";
import { ScrollView } from "@/components/ui/scroll-view";
import { Text } from "@/components/ui/text";
import { themeConfig } from "@/config/theme";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { ArrowDownUp, LayoutGrid, Plus, Search } from "lucide-react-native";

export default function LibraryScreen() {
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <Box>
      <SafeAreaView>
        <HStack className="my-6 px-6 items-center justify-between">
          <Heading className="text-white" size="2xl">
            Library
          </Heading>
          <HStack className="items-center gap-x-4">
            <Pressable>
              {({ pressed }) => (
                <Search color={themeConfig.theme.colors.white} />
              )}
            </Pressable>
            <Pressable>
              {({ pressed }) => <Plus color={themeConfig.theme.colors.white} />}
            </Pressable>
          </HStack>
        </HStack>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pl-6 gap-x-4"
        >
          <Pressable>
            {({ pressed }) => (
              <Badge className="rounded-full bg-gray-800 px-4 py-1 mr-4">
                <BadgeText className="normal-case text-md text-white">
                  Playlists
                </BadgeText>
              </Badge>
            )}
          </Pressable>
          <Pressable>
            {({ pressed }) => (
              <Badge className="rounded-full bg-gray-800 px-4 py-1">
                <BadgeText className="normal-case text-md text-white">
                  Albums
                </BadgeText>
              </Badge>
            )}
          </Pressable>
        </ScrollView>
        <HStack className="px-6 py-6 items-center justify-between">
          <Pressable>
            {({ pressed }) => (
              <HStack className="items-center gap-x-2">
                <ArrowDownUp size={16} color={themeConfig.theme.colors.white} />
                <Text className="text-white font-bold">Recent</Text>
              </HStack>
            )}
          </Pressable>
          <Pressable>
            {({ pressed }) => (
              <LayoutGrid size={16} color={themeConfig.theme.colors.white} />
            )}
          </Pressable>
        </HStack>
      </SafeAreaView>
    </Box>
  );
}
