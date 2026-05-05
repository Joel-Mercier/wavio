import * as Application from "expo-application";
import { useRouter } from "expo-router";
import {
  History,
  Library,
  ListMusic,
  LogOut,
  Server,
  Settings,
  Share2,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import useAuth from "@/stores/auth";

interface DrawerMenuProps {
  showDrawer: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ showDrawer, onClose }: DrawerMenuProps) {
  const { t } = useTranslation();
  const { bottom, top, left, right } = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuth((store) => store.logout);
  const username = useAuth((store) => store.username);

  const handleSettingsPress = () => {
    router.navigate("/settings");
    onClose();
  };

  const handleActivityPress = () => {
    router.navigate("/activity");
    onClose();
  };

  const handleQueuePress = () => {
    router.navigate("/queue");
    onClose();
  };

  const handleSharesPress = () => {
    router.navigate("/shares");
    onClose();
  };

  const handleServersPress = () => {
    router.navigate("/servers");
    onClose();
  };

  const handleLibrariesPress = () => {
    router.navigate("/libraries");
    onClose();
  };

  const handleLogoutPress = () => {
    logout();
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
          <HStack className="flex-1 items-center m-1 p-4 border-b-2 border-primary-500">
            <Avatar size="md" className="mr-4 bg-primary-400">
              <AvatarFallbackText className="font-body">
                {username}
              </AvatarFallbackText>
            </Avatar>
            <VStack>
              <Heading
                numberOfLines={1}
                size="xl"
                className="text-white font-bold"
              >
                {username}
              </Heading>
            </VStack>
          </HStack>
        </DrawerHeader>
        <DrawerBody>
          <VStack className="justify-between h-full">
            <VStack>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleActivityPress}
              >
                <History size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.activity")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleQueuePress}
              >
                <ListMusic size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.queue")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleLibrariesPress}
              >
                <Library size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.libraries")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleServersPress}
              >
                <Server size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.servers")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleSharesPress}
              >
                <Share2 size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.shares")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleSettingsPress}
              >
                <Settings size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.settings")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleLogoutPress}
              >
                <LogOut size={24} color={themeConfig.theme.colors.red[500]} />
                <Heading size="lg" className="text-red-500 font-normal">
                  {t("app.shared.sidebar.logout")}
                </Heading>
              </Pressable>
            </VStack>
            <Center className="mt-4">
              <Text className="text-primary-100">
                {t("app.shared.sidebar.version", {
                  version: Application.nativeApplicationVersion,
                })}
              </Text>
            </Center>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
