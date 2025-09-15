import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ListMusic, Radio } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef } from "react";

interface AddBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddBottomSheet({
  isOpen,
  onClose,
}: AddBottomSheetProps) {
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const handlePresentModalPress = () => {
    bottomSheetModalRef.current?.present();
  };

  const handleDismiss = () => {
    bottomSheetModalRef.current?.dismiss();
  };

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onClose();
      }
    },
    [onClose],
  );

  const handleCreatePlaylistPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/playlists/new");
  };

  const handleCreateInternetRadioStationPress = () => {
    bottomSheetModalRef.current?.dismiss();
    router.navigate("/internet-radio-stations/new");
  };

  useEffect(() => {
    if (isOpen) {
      handlePresentModalPress();
    } else {
      handleDismiss();
    }
  }, [isOpen]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      onChange={handleSheetChanges}
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
                <VStack className="ml-4">
                  <Heading className="text-white">Playlist</Heading>
                  <Text className="text-md text-gray-200">
                    Create a playlist with songs or podcast episodes
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
            <FadeOutScaleDown onPress={handleCreateInternetRadioStationPress}>
              <HStack className="items-center">
                <Radio size={32} color={themeConfig.theme.colors.gray[200]} />
                <VStack className="ml-4">
                  <Heading className="text-white">
                    Internet radio station
                  </Heading>
                  <Text className="text-md text-gray-200">
                    Create a internet radio station you can stream from the app
                  </Text>
                </VStack>
              </HStack>
            </FadeOutScaleDown>
          </VStack>
        </Box>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
