import {
  BottomSheetBackdrop,
  type BottomSheetModal,
  type BottomSheetModalProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SheetSearchInput from "@/components/SheetSearchInput";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useRadioTags } from "@/hooks/radioBrowser/useRadioBrowser";
import useApp from "@/stores/app";
import { cn } from "@/utils/tailwind";

/** Multi-select of the genre tag rows shown on the radio stations home screen. */
export default function RadioFeedTagsSheet({
  modalRef,
  onChange,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
  onChange: BottomSheetModalProps["onChange"];
}) {
  const { t } = useTranslation();
  const selectedTags = useApp((store) => store.internetRadioFeedTags);
  const setSelectedTags = useApp((store) => store.setInternetRadioFeedTags);
  const { data: tagsData } = useRadioTags({ limit: 120 });
  const [tagQuery, setTagQuery] = useState("");

  const filteredTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    const names = (tagsData ?? []).map((tag) => tag.name);
    // Keep already-selected tags visible even if they're outside the fetched
    // most-used list (or while offline).
    const merged = Array.from(new Set([...selectedTags, ...names]));
    if (!q) return merged;
    return merged.filter((name) => name.toLowerCase().includes(q));
  }, [tagQuery, tagsData, selectedTags]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags(
      selectedTags.includes(tag)
        ? selectedTags.filter((current) => current !== tag)
        : [...selectedTags, tag],
    );
  };

  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      snapPoints={["75%"]}
      enableDynamicSizing={false}
      onChange={onChange}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} />}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <Box className="p-6 w-full">
          <Heading className="text-white" size="lg">
            {t("app.settings.internetRadioStationsSettings.tagsSheetTitle")}
          </Heading>
          <Text className="text-primary-100 text-sm mt-2 mb-4">
            {t("app.settings.internetRadioStationsSettings.tagsDescription")}
          </Text>
          <VStack className="gap-y-2">
            <SheetSearchInput onChangeText={setTagQuery} />
            <HStack className="flex-wrap gap-2 mt-2 mb-12">
              {filteredTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <FadeOutScaleDown
                    key={tag}
                    onPress={() => handleToggleTag(tag)}
                  >
                    <Badge
                      className={cn("rounded-full bg-gray-800 px-4 py-1", {
                        "bg-emerald-500": selected,
                      })}
                    >
                      <BadgeText className="normal-case text-md text-white">
                        {tag}
                      </BadgeText>
                    </Badge>
                  </FadeOutScaleDown>
                );
              })}
            </HStack>
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
