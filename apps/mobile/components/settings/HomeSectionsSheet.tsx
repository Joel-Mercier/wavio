import {
  type BottomSheetModal,
  type BottomSheetModalProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { useCapabilities } from "@/hooks/useCapabilities";
import useApp from "@/stores/app";
import { HOME_SECTION_CATALOG } from "@/utils/homeFeed";
import { cn } from "@/utils/tailwind";

/** Multi-select of the sections shown on the home screen. */
export default function HomeSectionsSheet({
  modalRef,
  onChange,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
  onChange: BottomSheetModalProps["onChange"];
}) {
  const { t } = useTranslation();
  const hiddenHomeSections = useApp((store) => store.hiddenHomeSections);
  const setHiddenHomeSections = useApp((store) => store.setHiddenHomeSections);
  const capabilities = useCapabilities();

  const availableSections = HOME_SECTION_CATALOG.filter(
    (entry) => !entry.capability || capabilities[entry.capability],
  );

  const handleToggleSection = (key: string) => {
    setHiddenHomeSections(
      hiddenHomeSections.includes(key)
        ? hiddenHomeSections.filter((current) => current !== key)
        : [...hiddenHomeSections, key],
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
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <Box className="p-6 w-full">
          <Heading className="text-white" size="lg">
            {t("app.settings.displaySettings.homeSectionsSheetTitle")}
          </Heading>
          <Text className="text-primary-100 text-sm mt-2 mb-4">
            {t("app.settings.displaySettings.homeSectionsSheetDescription")}
          </Text>
          <HStack className="flex-wrap gap-2 mb-12">
            {availableSections.map((entry) => {
              const selected = !hiddenHomeSections.includes(entry.key);
              return (
                <FadeOutScaleDown
                  key={entry.key}
                  onPress={() => handleToggleSection(entry.key)}
                >
                  <Badge
                    className={cn("rounded-full bg-gray-800 px-4 py-1", {
                      "bg-emerald-500": selected,
                    })}
                  >
                    <BadgeText className="normal-case text-md text-white">
                      {t(entry.labelKey)}
                    </BadgeText>
                  </Badge>
                </FadeOutScaleDown>
              );
            })}
          </HStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
