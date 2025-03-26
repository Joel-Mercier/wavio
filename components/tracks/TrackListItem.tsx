import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Image } from "@/components/ui/image";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { themeConfig } from "@/config/theme";
import type { Child } from "@/services/openSubsonic/types";
import { cn } from "@/utils/tailwind";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { AudioLines, EllipsisVertical } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";

interface TrackListItemProps {
  track: Child;
  cover?: string;
  index: number;
  showIndex?: boolean;
}

export default function TrackListItem({
  track,
  cover,
  index,
  showIndex = false,
}: TrackListItemProps) {
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
      <HStack
        className={cn("items-center justify-between mb-4", {
          "mt-6": index === 0,
        })}
      >
        <HStack className="items-center">
          {showIndex && (
            <Text className="text-sm text-white mr-4">{index + 1}</Text>
          )}
          {cover ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${cover}` }}
              className="w-16 h-16 rounded-md aspect-square"
              alt="Track cover"
            />
          ) : (
            <Box className="w-16 h-16 aspect-square rounded-md bg-primary-600 items-center justify-center">
              <AudioLines size={24} color={themeConfig.theme.colors.white} />
            </Box>
          )}
          <VStack className="ml-4">
            <Heading
              className="text-white text-md font-normal capitalize"
              numberOfLines={1}
            >
              {track.title}
            </Heading>
            <Text numberOfLines={1} className="text-md text-primary-100">
              {track.artist}
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
