import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Toast, ToastDescription, useToast } from "@/components/ui/toast";
import useServers, { serverSchema } from "@/stores/servers";
import { cn } from "@/utils/tailwind";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { FlashList } from "@shopify/flash-list";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "expo-router";
import { AlertCircleIcon, ArrowLeft, Plus } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FLOATING_PLAYER_HEIGHT } from "../FloatingPlayer";

export default function ServersDetail() {
  const [showAddServerModal, setShowAddServerModal] = useState<boolean>(false);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const servers = useServers.use.servers();
  const addServer = useServers.use.addServer();
  const removeServer = useServers.use.removeServer();
  const form = useForm({
    defaultValues: {
      name: "",
      username: "",
      password: "",
      url: "",
    },
    validators: {
      onChange: serverSchema,
    },
    onSubmit: async ({ value }) => {
      addServer({
        ...value,
        current: false,
      });
      form.reset();
      toast.show({
        placement: "top",
        duration: 3000,
        render: () => (
          <Toast action="success">
            <ToastDescription>Server successfully added</ToastDescription>
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
          <Heading className="text-white ml-4" size="xl">
            Servers
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
        keyExtractor={(item) => item.name}
        contentContainerStyle={{
          paddingBottom: bottomTabBarHeight + FLOATING_PLAYER_HEIGHT,
        }}
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
              Add server
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <form.Field name="name">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder="Enter server name"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="url">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder="Enter server url"
                      keyboardType="url"
                      autoCapitalize="none"
                      textContentType="URL"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="username">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder="Enter server username"
                      autoCapitalize="none"
                      textContentType="username"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <FormControl
                  isInvalid={!field.state.meta.isValid}
                  size="md"
                  isDisabled={false}
                  isReadOnly={false}
                  isRequired={false}
                  className="my-4"
                >
                  <Input
                    className="bg-primary-600 border-0 rounded-full"
                    variant="rounded"
                    size="xl"
                  >
                    <InputField
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      onBlur={field.handleBlur}
                      className={cn(
                        "text-md text-white border border-primary-600 focus:border-emerald-500 rounded-full",
                        {
                          "border-red-500": !field.state.meta.isValid,
                        },
                      )}
                      placeholder="Enter user password"
                      secureTextEntry
                      autoCapitalize="none"
                      textContentType="password"
                    />
                  </Input>
                  {!field.state.meta.isValid && (
                    <FormControlError className="items-start">
                      <FormControlErrorIcon
                        as={AlertCircleIcon}
                        className="text-red-500"
                      />
                      <FormControlErrorText className="text-red-500 shrink">
                        {field.state.meta.errors
                          .map((error) => error.message)
                          .join("\n")}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
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
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={() => {
                form.state.isDirty ? form.handleSubmit() : undefined;
              }}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Save</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
