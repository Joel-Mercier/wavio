import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import useServers from "@/stores/servers";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import {
  ArrowDownUp,
  LogOut,
  Server,
  Settings,
  Share2,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface DrawerMenuProps {
  showDrawer: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ showDrawer, onClose }: DrawerMenuProps) {
  const { t } = useTranslation();
  const { bottom, top, left, right } = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuth.use.logout();
  const username = useAuth.use.username();
  const currentServer = useServers((state) =>
    state.servers.find((server) => server.current === true),
  );

  const handleSettingsPress = () => {
    router.navigate("/settings");
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

  const handleLogoutPress = () => {
    logout();
    onClose();
  };

  const handleCurrentServerPress = () => {
    router.navigate("/servers");
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
          <HStack className="w-full items-center m-1 p-4 border-b-2 border-primary-500">
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
                onPress={handleSettingsPress}
              >
                <Settings size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.settings")}
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
                onPress={handleServersPress}
              >
                <Server size={24} color={themeConfig.theme.colors.white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.servers")}
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
            {currentServer && (
              <VStack className="my-6">
                <Text className="text-primary-100 text-center mb-2">
                  {t("app.shared.sidebar.currentServer")}
                </Text>
                <FadeOutScaleDown
                  onPress={handleCurrentServerPress}
                  className="border border-primary-200 rounded-lg p-4 mx-6 bg-primary-800"
                >
                  <HStack className="items-center justify-between">
                    <VStack className="flex-1">
                      <Heading
                        size="lg"
                        className="text-white font-normal"
                        numberOfLines={1}
                      >
                        {currentServer.name}
                      </Heading>
                      <Text className="text-primary-100" numberOfLines={1}>
                        {currentServer.url}
                      </Text>
                    </VStack>
                    <ArrowDownUp
                      size={24}
                      color={themeConfig.theme.colors.white}
                    />
                  </HStack>
                </FadeOutScaleDown>
              </VStack>
            )}
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
