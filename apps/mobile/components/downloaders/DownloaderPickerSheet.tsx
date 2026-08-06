import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import ChevronRight from "lucide-react-native/dist/esm/icons/chevron-right.mjs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  type Downloader,
  useConnectedDownloaders,
} from "@/hooks/useDownloaders";

// The downloader picker lives once at the app root (mounted in app/(app)/_layout),
// so any screen opens it through this module-level opener rather than
// prop-drilling a ref.
let opener: ((query: string) => void) | null = null;

export function openDownloaderPicker(query: string) {
  opener?.(query);
}

// Asks which downloader to look a name up in. Mounted once at the app root and
// only ever opened when more than one downloader is connected — with a single
// one, useDownloaderSearch navigates straight to it.
export default function DownloaderPickerSheet() {
  const { t } = useTranslation();
  const router = useRouter();
  const [gray200] = Uniwind.getCSSVariable(["--color-gray-200"]) as string[];
  const downloaders = useConnectedDownloaders();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    opener = (next) => {
      setQuery(next);
      sheetRef.current?.present();
    };
    return () => {
      opener = null;
    };
  }, []);

  const handlePress = (downloader: Downloader) => {
    sheetRef.current?.dismiss();
    router.navigate(downloader.searchHref(query));
  };

  return (
    <CenteredBottomSheetModal
      ref={sheetRef}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
    >
      <BottomSheetScrollView contentContainerStyle={{ alignItems: "center" }}>
        <Box className="p-6 w-full mb-12">
          <VStack className="mt-6 gap-y-8">
            <VStack className="gap-y-1">
              <Heading className="text-white" size="md">
                {t("app.settings.downloaders.pickerTitle")}
              </Heading>
              <Text className="text-primary-100 text-sm" numberOfLines={2}>
                {query}
              </Text>
            </VStack>
            {downloaders.map((downloader) => (
              <FadeOutScaleDown
                key={downloader.id}
                onPress={() => handlePress(downloader)}
              >
                <HStack className="items-center justify-between">
                  <Text className="text-lg text-gray-200 ml-4">
                    {downloader.name}
                  </Text>
                  <ChevronRight size={20} color={gray200} />
                </HStack>
              </FadeOutScaleDown>
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
