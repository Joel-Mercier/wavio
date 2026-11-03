import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { type RefObject, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { autoDownloadService } from "@/services/offline/autoDownloadService";
import useOffline from "@/stores/offline";

export function useAutoDownloadExclusions() {
  const overrides = useOffline((s) => s.autoDownloadOverrides);
  return useMemo(
    () =>
      Object.entries(overrides)
        .filter(
          ([, override]) =>
            override.mode === "exclude" && override.kind !== "playlist",
        )
        .map(([key, override]) => ({ key, ...override }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [overrides],
  );
}

/** Albums and songs the user removed from the automatic downloads. */
export default function AutoDownloadExclusionsSheet({
  modalRef,
}: {
  modalRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const exclusions = useAutoDownloadExclusions();

  useEffect(() => {
    if (exclusions.length === 0) modalRef.current?.dismiss();
  }, [exclusions.length, modalRef]);

  return (
    <CenteredBottomSheetModal
      ref={modalRef}
      enableHalfExpand={false}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <Box className="p-6 w-full mb-12">
          <VStack className="gap-y-2">
            <Heading className="text-white font-bold" size="md">
              {t(
                "app.settings.offlineSettings.autoDownloadExclusionsSheetTitle",
              )}
            </Heading>
            <Text className="text-primary-100 text-sm">
              {t(
                "app.settings.offlineSettings.autoDownloadExclusionsSheetDescription",
              )}
            </Text>
          </VStack>
          {exclusions.length > 1 && (
            <Box className="mt-4 items-start">
              <FadeOutScaleDown
                onPress={() =>
                  autoDownloadService.includeAgain(
                    exclusions.map((exclusion) => exclusion.key),
                  )
                }
              >
                <Text className="text-emerald-500 font-bold">
                  {t("app.settings.offlineSettings.autoDownloadIncludeAll")}
                </Text>
              </FadeOutScaleDown>
            </Box>
          )}
          <VStack className="mt-6 gap-y-6">
            {exclusions.map((exclusion) => (
              <HStack
                key={exclusion.key}
                className="items-center justify-between gap-x-4"
              >
                <VStack className="flex-1 gap-y-1">
                  <Text className="text-lg text-gray-200" numberOfLines={1}>
                    {exclusion.name}
                  </Text>
                  <Text className="text-primary-100 text-sm">
                    {t(
                      exclusion.kind === "album"
                        ? "app.settings.offlineSettings.autoDownloadExclusionAlbum"
                        : "app.settings.offlineSettings.autoDownloadExclusionSong",
                    )}
                  </Text>
                </VStack>
                <FadeOutScaleDown
                  onPress={() =>
                    autoDownloadService.includeAgain([exclusion.key])
                  }
                >
                  <Text className="text-emerald-500 font-bold">
                    {t("app.settings.offlineSettings.autoDownloadIncludeAgain")}
                  </Text>
                </FadeOutScaleDown>
              </HStack>
            ))}
          </VStack>
        </Box>
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
