import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Box } from "@/components/ui/box";
import { Center } from "@/components/ui/center";
import {
  FormControl,
  FormControlError,
  FormControlErrorIcon,
  FormControlErrorText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import {
  Toast,
  ToastDescription,
  ToastTitle,
  useToast,
} from "@/components/ui/toast";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  useDeleteInternetRadioStation,
  useUpdateInternetRadioStation,
} from "@/hooks/openSubsonic/useInternetRadioStations";
import { useBottomSheetBackHandler } from "@/hooks/useBottomSheetBackHandler";
import useImageColors from "@/hooks/useImageColors";
import useWebsiteMetadata from "@/hooks/useWebsiteMetadata";
import useRecentPlays from "@/stores/recentPlays";
import { cn } from "@/utils/tailwind";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircleIcon,
  ArrowLeft,
  EllipsisVertical,
  Info,
  Pause,
  Pencil,
  Play,
  Radio,
  SquareArrowOutUpRight,
  Trash,
} from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { AudioPro, AudioProState, useAudioPro } from "react-native-audio-pro";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import z from "zod";

const updateInternetRadioStationSchema = z.object({
  name: z.string().min(1),
  streamUrl: z.url(),
  homePageUrl: z.url().optional(),
});

export default function InternetRadioStationDetail() {
  const [showAlertDialog, setShowAlertDialog] = useState<boolean>(false);
  const [showEditAlertDialog, setShowEditAlertDialog] =
    useState<boolean>(false);
  const { id, streamUrl, name, homePageUrl } = useLocalSearchParams<{
    id: string;
    streamUrl: string;
    name: string;
    homePageUrl?: string;
  }>();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { handleSheetPositionChange } =
    useBottomSheetBackHandler(bottomSheetModalRef);
  const toast = useToast();
  const addRecentPlay = useRecentPlays.use.addRecentPlay();
  const doDeleteInternetRadioStation = useDeleteInternetRadioStation();
  const doUpdateInternetRadioStation = useUpdateInternetRadioStation();
  const insets = useSafeAreaInsets();
  const bottomTabBarHeight = useBottomTabBarHeight();
  const { state } = useAudioPro();
  const queryClient = useQueryClient();
  const meta = useWebsiteMetadata(homePageUrl);
  const colors = useImageColors(meta.image || meta["twitter:image"]);
  const form = useForm({
    defaultValues: {
      name,
      streamUrl,
      homePageUrl,
    },
    validators: {
      onChange: updateInternetRadioStationSchema,
    },
    onSubmit: async ({ value }) => {
      doUpdateInternetRadioStation.mutate(
        { id, ...value },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: ["internet_radio_stations"],
            });
            setShowEditAlertDialog(false);
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="success">
                  <ToastTitle>
                    Internet radio station successfully updated
                  </ToastTitle>
                  <ToastDescription>
                    Internet radio station has been successfully updated.
                  </ToastDescription>
                </Toast>
              ),
            });
          },
          onError: (error) => {
            toast.show({
              placement: "top",
              duration: 3000,
              render: () => (
                <Toast action="error">
                  <ToastTitle>Error</ToastTitle>
                  <ToastDescription>
                    An error occurred while updating the internet radio station.
                  </ToastDescription>
                </Toast>
              ),
            });
          },
        },
      );
    },
  });

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleVisitHomePagePress = async () => {
    if (homePageUrl && (await Linking.canOpenURL(homePageUrl))) {
      Linking.openURL(homePageUrl);
    }
    bottomSheetModalRef.current?.dismiss();
  };

  const handleDeletePress = () => {
    bottomSheetModalRef.current?.dismiss();
    doDeleteInternetRadioStation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["internet_radio_stations"],
          });
          router.back();
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="success">
                <ToastTitle>
                  Internet radio station successfully deleted
                </ToastTitle>
                <ToastDescription>
                  Internet radio station has been successfully deleted.
                </ToastDescription>
              </Toast>
            ),
          });
        },
        onError: (error) => {
          toast.show({
            placement: "top",
            duration: 3000,
            render: () => (
              <Toast action="error">
                <ToastTitle>Error</ToastTitle>
                <ToastDescription>
                  An error occurred while deleting the internet radio station.
                </ToastDescription>
              </Toast>
            ),
          });
        },
      },
    );
  };

  const handleShowEditAlertDialog = () => {
    bottomSheetModalRef.current?.dismiss();
    setShowEditAlertDialog(true);
  };

  const handleCloseAlertDialog = () => setShowAlertDialog(false);

  const handleCloseEditAlertDialog = () => setShowEditAlertDialog(false);

  const handlePlayPausePress = () => {
    if (state === AudioProState.PLAYING) {
      AudioPro.stop();
    } else {
      AudioPro.play({
        id,
        url: streamUrl,
        title: name,
        artwork: meta.image || meta["twitter:image"],
        artist: homePageUrl,
      });
      addRecentPlay({
        id,
        title: name,
        type: "internetRadioStation",
        homePageUrl,
        streamUrl,
        coverArt: meta.image || meta["twitter:image"],
      });
    }
  };

  return (
    <Box
      className="h-full w-full"
      style={{
        paddingBottom: insets.bottom + bottomTabBarHeight,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <LinearGradient
        colors={[
          (colors?.platform === "ios" ? colors.primary : colors?.vibrant) ||
            themeConfig.theme.colors.blue[500],
          "#000000",
        ]}
        className="px-6"
        style={{ paddingTop: insets.top }}
      >
        <HStack className="mt-6 items-start justify-between">
          <FadeOutScaleDown
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          >
            <ArrowLeft size={24} color={themeConfig.theme.colors.white} />
          </FadeOutScaleDown>
          {meta.image || meta["twitter:image"] ? (
            <Image
              source={{ uri: meta.image || meta["twitter:image"] }}
              className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center"
              alt="Internet radio station cover"
            />
          ) : (
            <Box className="w-[70%] aspect-square rounded-md bg-primary-600 items-center justify-center">
              <Radio size={48} color={themeConfig.theme.colors.white} />
            </Box>
          )}
          <Box className="w-10" />
        </HStack>
        <VStack>
          <HStack className="mt-5 items-center justify-between">
            <Heading numberOfLines={1} className="text-white" size="2xl">
              {name}
            </Heading>
          </HStack>
          <HStack className="mt-4 items-center justify-between">
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown onPress={handlePresentModalPress}>
                <EllipsisVertical color={themeConfig.theme.colors.white} />
              </FadeOutScaleDown>
            </HStack>
            <HStack className="items-center gap-x-4">
              <FadeOutScaleDown onPress={handlePlayPausePress}>
                <Box className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center">
                  {state === AudioProState.PLAYING ? (
                    <Pause
                      color={themeConfig.theme.colors.white}
                      fill={themeConfig.theme.colors.white}
                    />
                  ) : (
                    <Play
                      color={themeConfig.theme.colors.white}
                      fill={themeConfig.theme.colors.white}
                    />
                  )}
                </Box>
              </FadeOutScaleDown>
            </HStack>
          </HStack>
        </VStack>
      </LinearGradient>
      <VStack>
        {homePageUrl && (
          <Center className="mt-6">
            <FadeOutScaleDown
              className="flex flex-row gap-x-2 items-center justify-center py-3 px-8 border border-white bg-white rounded-full ml-4 mt-4"
              onPress={handleVisitHomePagePress}
            >
              <SquareArrowOutUpRight
                size={20}
                color={themeConfig.theme.colors.gray[800]}
              />
              <Text className="text-primary-800 font-bold text-lg">
                Visit homepage
              </Text>
            </FadeOutScaleDown>
          </Center>
        )}
      </VStack>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        onChange={handleSheetPositionChange}
        backgroundStyle={{
          backgroundColor: "rgb(41, 41, 41)",
        }}
        handleIndicatorStyle={{
          backgroundColor: "#b3b3b3",
        }}
        backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
      >
        <BottomSheetView
          style={{
            flex: 1,
            alignItems: "center",
          }}
        >
          <Box className="p-6 w-full mb-12">
            <HStack className="items-center">
              <Box className="w-16 h-16 aspect-square rounded-md bg-primary-800 items-center justify-center">
                <Radio size={24} color={themeConfig.theme.colors.white} />
              </Box>
              <VStack className="ml-4 flex-1">
                <Heading
                  className="text-white font-normal"
                  size="lg"
                  numberOfLines={1}
                >
                  {name}
                </Heading>
                <Text numberOfLines={1} className="text-md text-primary-100">
                  {streamUrl}
                </Text>
              </VStack>
            </HStack>
            <VStack className="mt-6 gap-y-8">
              {homePageUrl && (
                <FadeOutScaleDown onPress={handleVisitHomePagePress}>
                  <HStack className="items-center">
                    <Info
                      size={24}
                      color={themeConfig.theme.colors.gray[200]}
                    />
                    <Text className="ml-4 text-lg text-gray-200">
                      Visit home page
                    </Text>
                  </HStack>
                </FadeOutScaleDown>
              )}
              <FadeOutScaleDown onPress={handleShowEditAlertDialog}>
                <HStack className="items-center">
                  <Pencil
                    size={24}
                    color={themeConfig.theme.colors.gray[200]}
                  />
                  <Text className="ml-4 text-lg text-gray-200">
                    Edit internet radio station
                  </Text>
                </HStack>
              </FadeOutScaleDown>
              <FadeOutScaleDown onPress={handleDeletePress}>
                <HStack className="items-center">
                  <Trash size={24} color={themeConfig.theme.colors.gray[200]} />
                  <Text className="ml-4 text-lg text-gray-200">
                    Delete internet radio station
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            </VStack>
          </Box>
        </BottomSheetView>
      </BottomSheetModal>
      <AlertDialog
        isOpen={showAlertDialog}
        onClose={handleCloseAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              Are you sure you want to delete this interne radio station?
            </Heading>
          </AlertDialogHeader>
          <AlertDialogBody className="mt-3 mb-4">
            <Text className="text-primary-50" size="sm">
              Deleting the internet radio station will remove it permanently.
              Please confirm if you want to proceed.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={handleCloseAlertDialog}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={handleDeletePress}
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">Delete</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        isOpen={showEditAlertDialog}
        onClose={handleCloseEditAlertDialog}
        size="md"
      >
        <AlertDialogBackdrop />
        <AlertDialogContent className="bg-primary-800 border-primary-400">
          <AlertDialogHeader>
            <Heading className="text-white font-bold" size="md">
              Edit internet radio station
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
                      placeholder="Name"
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
                          .join("\n")}{" "}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="streamUrl">
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
                      placeholder="Stream URL"
                      keyboardType="url"
                      textContentType="URL"
                      autoCapitalize="none"
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
                          .join("\n")}{" "}
                      </FormControlErrorText>
                    </FormControlError>
                  )}
                </FormControl>
              )}
            </form.Field>
            <form.Field name="homePageUrl">
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
                      placeholder="Homepage URL"
                      keyboardType="url"
                      textContentType="URL"
                      autoCapitalize="none"
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
                          .join("\n")}{" "}
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
                handleCloseEditAlertDialog();
              }}
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">Cancel</Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={
                form.state.isDirty || !form.state.isSubmitting
                  ? form.handleSubmit
                  : undefined
              }
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4 opacity-65"
            >
              <Text className="text-primary-800 font-bold text-lg">Save</Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Box>
  );
}
