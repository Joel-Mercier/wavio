import LibraryListItem from "@/components/library/LibraryListItem";
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
import {
  ArrowDownUp,
  LayoutGrid,
  List,
  Plus,
  Search,
} from "lucide-react-native";
import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";

export type LibraryLayout = "list" | "grid";

export default function LibraryScreen() {
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  const [layout, setLayout] = useState<LibraryLayout>("list");
  const tabBarHeight = useBottomTabBarHeight();

  const handleHeaderLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    console.log("header height is ", height);
    setHeaderHeight(height);
  };

  const handleLayoutPress = () => {
    setLayout(layout === "list" ? "grid" : "list");
  };

  return (
    <SafeAreaView>
      <Box onLayout={handleHeaderLayout}>
        <HStack className="mt-6 px-6 items-center justify-between">
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
          className="pl-6 gap-x-4 my-6"
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
      </Box>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: tabBarHeight + headerHeight + 16,
        }}
      >
        <HStack className="px-6 pb-6 items-center justify-between">
          <Pressable>
            {({ pressed }) => (
              <HStack className="items-center gap-x-2">
                <ArrowDownUp size={16} color={themeConfig.theme.colors.white} />
                <Text className="text-white font-bold">Recent</Text>
              </HStack>
            )}
          </Pressable>
          <Pressable onPress={handleLayoutPress}>
            {({ pressed }) => {
              return layout === "list" ? (
                <LayoutGrid size={16} color={themeConfig.theme.colors.white} />
              ) : (
                <List size={16} color={themeConfig.theme.colors.white} />
              );
            }}
          </Pressable>
        </HStack>
        <Box className="px-6 gap-4">
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
          <LibraryListItem layout={layout} />
        </Box>
      </ScrollView>
    </SafeAreaView>
  );
}
