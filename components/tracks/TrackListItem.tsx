import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { EllipsisVertical } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";

export default function TrackListItem() {
  const [showActionsheet, setShowActionsheet] = useState<boolean>(false);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  // callbacks
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleClose = () => {
    setShowActionsheet(false);
  };
  return (
    <>
      <HStack className="items-center justify-between">
        <HStack className="items-center">
          <Image
            source={require("@/assets/images/covers/gunship-unicorn.jpg")}
            className="w-16 h-16 rounded-md aspect-square"
            alt="Track cover"
          />
          <VStack className="ml-4">
            <Heading
              className="text-white text-md font-normal capitalize"
              numberOfLines={1}
            >
              Everything in it's right place
            </Heading>
            <Text numberOfLines={1} className="text-md text-primary-100">
              Radiohead
            </Text>
          </VStack>
        </HStack>
        <Pressable onPress={handlePresentModalPress}>
          {({ pressed }) => (
            <EllipsisVertical color={themeConfig.theme.colors.gray[300]} />
          )}
        </Pressable>
        <BottomSheetModal ref={bottomSheetModalRef}>
          <BottomSheetView style={{ flex: 1, alignItems: "center" }}>
            <Text>Awesome 🎉</Text>
          </BottomSheetView>
        </BottomSheetModal>
      </HStack>
    </>
  );
}
