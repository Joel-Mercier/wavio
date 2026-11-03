import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import ListTree from "lucide-react-native/icons/list-tree";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import BottomSheetModalComponent from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useAudiobookChapterPlaying } from "@/hooks/audiobookshelf/useAudiobookNowPlaying";
import { play, seekAudiobookTo } from "@/services/player";
import useAudiobookProgressBase from "@/stores/audiobookProgress";
import { formatLongSeconds } from "@/utils/date";

export default function AudiobookChaptersSheet({
  sheetRef,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const [gray200, emerald500] = Uniwind.getCSSVariable([
    "--color-gray-200",
    "--color-emerald-500",
  ]) as string[];
  const { itemId, chapterIndex } = useAudiobookChapterPlaying();
  const book = useAudiobookProgressBase((s) =>
    itemId ? s.books[itemId] : undefined,
  );
  const chapters = book?.chapters ?? [];

  return (
    <BottomSheetModalComponent
      ref={sheetRef}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <Box className="p-6 w-full mb-12">
          <HStack className="items-center mb-6">
            <ListTree size={24} color={gray200} />
            <Heading
              className="ml-4 text-white font-normal"
              size="lg"
              numberOfLines={1}
            >
              {t("app.audiobooks.chapters")}
            </Heading>
          </HStack>
          <VStack className="gap-y-5">
            {chapters.map((chapter, index) => (
              <FadeOutScaleDown
                key={chapter.start}
                onPress={() => {
                  sheetRef.current?.dismiss();
                  if (seekAudiobookTo(chapter.start)) play();
                }}
              >
                <HStack className="items-center gap-x-4">
                  <Text
                    className="flex-1 text-lg"
                    numberOfLines={2}
                    style={{
                      color: index === chapterIndex ? emerald500 : gray200,
                    }}
                  >
                    {chapter.title}
                  </Text>
                  <Text className="text-primary-100 text-sm">
                    {formatLongSeconds(chapter.start)}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </BottomSheetModalComponent>
  );
}
