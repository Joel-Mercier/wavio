import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Center } from "@/components/ui/center";
import {
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from "@/components/ui/drawer";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { Settings } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface HomeDrawerProps {
  showDrawer: boolean;
  onClose: () => void;
}

export default function HomeDrawer({ showDrawer, onClose }: HomeDrawerProps) {
  const { bottom, top, left, right } = useSafeAreaInsets();
  const router = useRouter();

  const handleSettingsPress = () => {
    router.navigate("/settings");
    onClose();
  };

  return (
    <Drawer isOpen={showDrawer} onClose={onClose} size="lg" anchor="left">
      <DrawerBackdrop />
      <DrawerContent
        className="bg-primary-600 border-0"
        style={{
          paddingTop: top,
          paddingBottom: bottom,
          paddingLeft: left,
          paddingRight: right,
        }}
      >
        <DrawerHeader>
          <Pressable className="w-full">
            <HStack className="items-center m-1 p-4 border-b-2 border-primary-500 active:bg-primary-800">
              <Avatar size="md" className="mr-4 bg-primary-400">
                <AvatarFallbackText className="font-body">
                  {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                </AvatarFallbackText>
              </Avatar>
              <VStack>
                <Heading
                  numberOfLines={1}
                  size="xl"
                  className="text-white font-bold"
                >
                  {process.env.EXPO_PUBLIC_NAVIDROME_USERNAME || ""}
                </Heading>
                <Text className="text-primary-100">See profile</Text>
              </VStack>
            </HStack>
          </Pressable>
        </DrawerHeader>
        <DrawerBody>
          <HStack
            className="items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
            onPress={handleSettingsPress}
          >
            <Settings size={24} color={themeConfig.theme.colors.white} />
            <Heading size="lg" className="text-white font-normal">
              Settings
            </Heading>
          </HStack>
          <Center className="mt-4">
            <Text className="text-primary-100">
              version {Application.nativeApplicationVersion}
            </Text>
          </Center>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
