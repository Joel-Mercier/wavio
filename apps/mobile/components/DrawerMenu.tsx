import { SelectPortalContext } from "@gluestack-ui/core/lib/esm/select/creator/SelectContext";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import ArrowLeftRight from "lucide-react-native/dist/esm/icons/arrow-left-right.mjs";
import Bug from "lucide-react-native/dist/esm/icons/bug.mjs";
import History from "lucide-react-native/dist/esm/icons/history.mjs";
import Library from "lucide-react-native/dist/esm/icons/library.mjs";
import ListMusic from "lucide-react-native/dist/esm/icons/list-music.mjs";
import LogOut from "lucide-react-native/dist/esm/icons/log-out.mjs";
import Server from "lucide-react-native/dist/esm/icons/server.mjs";
import Settings from "lucide-react-native/dist/esm/icons/settings.mjs";
import Share2 from "lucide-react-native/dist/esm/icons/share-2.mjs";
import ShieldCheck from "lucide-react-native/dist/esm/icons/shield-check.mjs";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import { Avatar, AvatarFallbackText } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
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
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useCapabilities } from "@/hooks/useCapabilities";
import useAuth from "@/stores/auth";
import useServers, { type ServerUser } from "@/stores/servers";

interface DrawerMenuProps {
  showDrawer: boolean;
  onClose: () => void;
}

function SwitchUserRow({
  user,
  onSelect,
}: {
  user: ServerUser;
  onSelect: (username: string) => void;
}) {
  const { handleClose } = useContext(SelectPortalContext);
  return (
    <Pressable
      className="flex-row items-center p-4 gap-x-4 rounded-md active:bg-primary-700"
      onPress={() => {
        handleClose?.();
        onSelect(user.username);
      }}
    >
      <Avatar className="bg-primary-400">
        <AvatarFallbackText className="font-body">
          {user.username}
        </AvatarFallbackText>
      </Avatar>
      <Heading size="md" className="text-white font-normal" numberOfLines={1}>
        {user.username}
      </Heading>
    </Pressable>
  );
}

export default function DrawerMenu({ showDrawer, onClose }: DrawerMenuProps) {
  const [white, red500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-red-500",
  ]) as string[];
  const { t, i18n } = useTranslation();
  const { bottom, top, left, right } = useSafeAreaInsets();
  const router = useRouter();
  const logout = useAuth((store) => store.logout);
  const username = useAuth((store) => store.username);
  const url = useAuth((store) => store.url);
  const capabilities = useCapabilities();
  const servers = useServers((store) => store.servers);
  const allUsers = useServers((store) => store.users);
  const currentServer = servers.find((s) => s.url === url);
  const otherUsers = currentServer
    ? allUsers.filter(
        (u) => u.serverId === currentServer.id && u.username !== username,
      )
    : [];

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

  const handlePrivacyPolicyPress = () => {
    const path = i18n.language.startsWith("fr") ? "/fr/privacy" : "/privacy";
    Linking.openURL(`https://wavio-app.vercel.app${path}`);
  };

  const handleBugReportPress = () => {
    Linking.openURL("https://github.com/Joel-Mercier/wavio/issues");
  };

  const handleSwitchUser = (nextUsername: string) => {
    if (!currentServer) return;
    onClose();
    router.replace({
      pathname: "/(auth)/login",
      params: { serverId: currentServer.id, username: nextUsername },
    });
    logout();
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
            <Pressable
              className="flex-row flex-1 items-center"
              onPress={() => {
                onClose();
                router.navigate(`/profile/${username}`);
              }}
            >
              <Avatar className="mr-4 bg-primary-400 w-10 h-10">
                <AvatarFallbackText className="font-body">
                  {username}
                </AvatarFallbackText>
              </Avatar>
              <VStack className="flex-1">
                <Heading
                  numberOfLines={1}
                  size="lg"
                  className="text-white font-bold"
                >
                  {username}
                </Heading>
                <Text className="text-primary-300 text-sm">
                  {t("app.shared.sidebar.seeProfile")}
                </Text>
              </VStack>
            </Pressable>
            {otherUsers.length > 0 && (
              <Select>
                <SelectTrigger
                  variant="outline"
                  className="border-0 p-2 rounded-full active:bg-primary-800"
                  accessibilityLabel={t("app.shared.sidebar.switchUser")}
                >
                  <ArrowLeftRight size={22} color={white} />
                </SelectTrigger>
                <SelectPortal snapPoints={[50]}>
                  <SelectBackdrop />
                  <SelectContent className="bg-primary-600">
                    <SelectDragIndicatorWrapper className="mb-4">
                      <SelectDragIndicator />
                    </SelectDragIndicatorWrapper>
                    <SelectScrollView>
                      <Box className="px-4 pb-12 w-full">
                        {otherUsers.map((u) => (
                          <SwitchUserRow
                            key={`${u.serverId}:${u.username}`}
                            user={u}
                            onSelect={handleSwitchUser}
                          />
                        ))}
                      </Box>
                    </SelectScrollView>
                  </SelectContent>
                </SelectPortal>
              </Select>
            )}
          </HStack>
        </DrawerHeader>
        <DrawerBody>
          <VStack className="justify-between h-full">
            <VStack>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleActivityPress}
              >
                <History size={24} color={white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.activity")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleQueuePress}
              >
                <ListMusic size={24} color={white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.queue")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleLibrariesPress}
              >
                <Library size={24} color={white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.libraries")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleServersPress}
              >
                <Server size={24} color={white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.servers")}
                </Heading>
              </Pressable>
              {capabilities.sharing && (
                <Pressable
                  className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                  onPress={handleSharesPress}
                >
                  <Share2 size={24} color={white} />
                  <Heading size="lg" className="text-white font-normal">
                    {t("app.shared.sidebar.shares")}
                  </Heading>
                </Pressable>
              )}
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleSettingsPress}
              >
                <Settings size={24} color={white} />
                <Heading size="lg" className="text-white font-normal">
                  {t("app.shared.sidebar.settings")}
                </Heading>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-4 border-primary-500 gap-x-4 rounded-md active:bg-primary-800"
                onPress={handleLogoutPress}
              >
                <LogOut size={24} color={red500} />
                <Heading size="lg" className="text-red-500 font-normal">
                  {t("app.shared.sidebar.logout")}
                </Heading>
              </Pressable>
            </VStack>
            <VStack className="mt-4 pt-4 border-t-2 border-primary-500">
              <Pressable
                className="flex-row items-center m-1 p-3 gap-x-3 rounded-md active:bg-primary-800"
                onPress={handlePrivacyPolicyPress}
              >
                <ShieldCheck size={20} color={white} />
                <Text className="text-white">
                  {t("app.shared.sidebar.privacyPolicy")}
                </Text>
              </Pressable>
              <Pressable
                className="flex-row items-center m-1 p-3 gap-x-3 rounded-md active:bg-primary-800"
                onPress={handleBugReportPress}
              >
                <Bug size={20} color={white} />
                <Text className="text-white">
                  {t("app.shared.sidebar.bugReport")}
                </Text>
              </Pressable>
              <Text className="mt-2 ml-4 text-primary-100">
                {t("app.shared.sidebar.version", {
                  version: Application.nativeApplicationVersion,
                })}
              </Text>
            </VStack>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
