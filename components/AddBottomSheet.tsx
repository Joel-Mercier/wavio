import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ListMusic, Radio } from "lucide-react-native";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";

const AddBottomSheet = forwardRef<BottomSheetModal>((_props, ref) => {
  const { t } = useTranslation();
  const router = useRouter();

  const dismiss = () => {
    if (ref && typeof ref !== "function") {
      ref.current?.dismiss();
    }
  };

  const handleCreatePlaylistPress = () => {
    dismiss();
    router.navigate("/playlists/new");
  };

  const handleCreateInternetRadioStationPress = () => {
    dismiss();
    router.navigate("/internet-radio-stations/new");
  };

  return (
    <BottomSheetModal
      ref={ref}
      enablePanDownToClose={true}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
    >
      <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <VStack className="mt-6 gap-y-8">
            <FadeOutScaleDown onPress={handleCreatePlaylistPress}>
              <HStack className="items-center">
                <ListMusic
                  size={32}
                  color={themeConfig.theme.colors.gray[200]}
                />
                <VStack className="ml-4 flex-1">
                  <Heading numberOfLines={1} className="text-white">
                    {t("app.create.playlistTitle")}
                  </Heading>
                  <Text className="text-md text-gray-200 flex-1">
                    {t("app.create.playlistDescription")}
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={handleCreateInternetRadioStationPress}>
              <HStack className="items-center">
                <Radio size={32} color={themeConfig.theme.colors.gray[200]} />
                <VStack className="ml-4 flex-1">
                  <Heading numberOfLines={1} className="text-white">
                    {t("app.create.internetRadioStationTitle")}
                  </Heading>
                  <Text className="text-md text-gray-200 flex-1">
                    {t("app.create.internetRadioStationDescription")}
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
          </VStack>
        </Box>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

AddBottomSheet.displayName = "AddBottomSheet";

export default AddBottomSheet;
