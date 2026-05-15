import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import ArrowLeft from "lucide-react-native/dist/esm/icons/arrow-left.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EmptyDisplay from "@/components/EmptyDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { FLOATING_PLAYER_HEIGHT } from "@/components/FloatingPlayer";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import ServerListItem from "@/components/servers/ServerListItem";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { FormControl } from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { useUsers as useNavidromeUsers } from "@/hooks/navidrome/useUsers";
import { useUsers } from "@/hooks/openSubsonic/useUsers";
import useAuth from "@/stores/auth";
import useServers, { serverFormSchema } from "@/stores/servers";

export default function ServersDetail() {
  const { t } = useTranslation();
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const servers = useServers((store) => store.servers);
  const addServer = useServers((store) => store.addServer);
  const syncServerUsers = useServers((store) => store.syncServerUsers);
  const isAuthenticated = useAuth((store) => store.isAuthenticated);
  const hasNavidromeNative = useAuth((store) => store.hasNavidromeNative);
  const isAdmin = useAuth((store) => store.isAdmin);
  const currentServer = servers.find((s) => s.current);
  const { data: subsonicUsers } = useUsers({
    enabled: !hasNavidromeNative && isAuthenticated && !!currentServer,
  });
  const { data: navidromeUsers } = useNavidromeUsers({
    enabled:
      hasNavidromeNative && isAdmin && isAuthenticated && !!currentServer,
  });
  useEffect(() => {
    if (!currentServer) return;
    if (hasNavidromeNative) {
      if (!navidromeUsers) return;
      syncServerUsers(
        currentServer.id,
        navidromeUsers.map((u) => u.userName),
      );
    } else {
      if (!subsonicUsers?.users?.user) return;
      syncServerUsers(
        currentServer.id,
        subsonicUsers.users.user.map((u) => u.username),
      );
    }
  }, [
    currentServer,
    hasNavidromeNative,
    subsonicUsers,
    navidromeUsers,
    syncServerUsers,
  ]);
  const form = useForm({
    defaultValues: {
      name: "",
      url: "",
    },
    validators: {
      onChange: serverFormSchema,
    },
    onSubmit: async ({ value }) => {
      addServer({ name: value.name, url: value.url });
      form.reset();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastTitle>{t("app.shared.toastSuccessTitle")}</ToastTitle>
            <ToastDescription>
              {t("app.servers.createServerSuccessMessage")}
            </ToastDescription>
          </Toast>
        ),
      });
      setShowAddServerModal(false);
    },
  });

  const handleAddServerPress = () => {
    setShowAddServerModal(true);
  };

  const handleCloseAddServerModal = () => {
    setShowAddServerModal(false);
  };

  return (
    <Box className="px-6 mt-6 pb-6 h-full">
      <HStack
        className="items-center mb-6 justify-between"
        style={{ paddingTop: insets.top }}
      >
        <HStack className="items-center">
          <FadeOutScaleDown onPress={() => router.back()}>
            <ArrowLeft size={24} color="white" />
          </FadeOutScaleDown>
          <Heading className="text-white ml-4" size="lg">
            {t("app.servers.title")}
          </Heading>
        </HStack>
        <FadeOutScaleDown onPress={handleAddServerPress}>
          <Plus size={24} color="white" />
        </FadeOutScaleDown>
      </HStack>
      <FlashList
        data={servers}
        renderItem={({ item }) => <ServerListItem server={item} />}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
        ListEmptyComponent={() => <EmptyDisplay />}
      />
      <AlertDialog
        isOpen={showAddServerModal}
        onClose={handleCloseAddServerModal}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              {t("app.servers.addServer")}
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="name">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t("app.servers.namePlaceholder")}
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
            <form.Field name="url">
              {(field) => (
                <FormControl
                  isInvalid={showFieldError(field)}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={() => handleFieldBlur(field)}
                      className="text-md text-white"
                      placeholder={t("app.servers.urlPlaceholder")}
                      autoCapitalize="none"
                      textContentType="URL"
                    />
                  </Input>
                  <FieldError field={field} />
                </FormControl>
              )}
            </form.Field>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={() => {
                form.reset();
                handleCloseAddServerModal();
              }}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {t("app.shared.cancel")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                form.state.isDirty ? form.handleSubmit() : undefined;
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {t("app.shared.save")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
