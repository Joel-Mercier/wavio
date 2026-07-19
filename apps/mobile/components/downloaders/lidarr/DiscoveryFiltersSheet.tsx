import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { type RefObject, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import SelectBottomSheet from "@/components/SelectBottomSheet";
import SelectFieldRow from "@/components/SelectFieldRow";
import { Box } from "@/components/ui/box";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
} from "@/components/ui/form-control";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useLidarrProfiles } from "@/hooks/lidarr/useLidarrProfiles";
import useLidarr from "@/stores/lidarr";

export default function DiscoveryFiltersSheet({
  sheetRef,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [white, gray500, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
    "--color-emerald-500",
  ]) as string[];
  const { qualityProfiles, metadataProfiles, rootFolders } =
    useLidarrProfiles();

  const qualityProfileId = useLidarr((s) => s.qualityProfileId);
  const metadataProfileId = useLidarr((s) => s.metadataProfileId);
  const rootFolderPath = useLidarr((s) => s.rootFolderPath);
  const monitorAdded = useLidarr((s) => s.monitorAdded);
  const setAddDefaults = useLidarr((s) => s.setAddDefaults);

  const qualitySheetRef = useRef<BottomSheetModal>(null);
  const metadataSheetRef = useRef<BottomSheetModal>(null);
  const rootSheetRef = useRef<BottomSheetModal>(null);

  const selectedQuality = qualityProfiles.find(
    (p) => p.id === qualityProfileId,
  );
  const selectedMetadata = metadataProfiles.find(
    (p) => p.id === metadataProfileId,
  );
  const placeholder = t("app.settings.downloaders.discovery.selectPlaceholder");

  return (
    <>
      <CenteredBottomSheetModal
        ref={sheetRef}
        snapPoints={["70%"]}
        backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
        handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
      >
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
        >
          <Box className="p-6 w-full">
            <Heading className="text-white" size="lg">
              {t("app.settings.downloaders.discovery.filtersTitle")}
            </Heading>
            <Text className="text-primary-100 text-sm mt-1">
              {t("app.settings.downloaders.discovery.filtersDescription")}
            </Text>

            <SelectFieldRow
              label={t("app.settings.downloaders.discovery.qualityProfile")}
              value={selectedQuality?.name}
              placeholder={placeholder}
              onPress={() => qualitySheetRef.current?.present()}
            />
            <SelectFieldRow
              label={t("app.settings.downloaders.discovery.metadataProfile")}
              value={selectedMetadata?.name}
              placeholder={placeholder}
              onPress={() => metadataSheetRef.current?.present()}
            />
            <SelectFieldRow
              label={t("app.settings.downloaders.discovery.rootFolder")}
              value={rootFolderPath ?? undefined}
              placeholder={placeholder}
              onPress={() => rootSheetRef.current?.present()}
            />

            <FormControl size="md" className="my-4">
              <HStack className="items-center justify-between">
                <FormControlLabel>
                  <FormControlLabelText className="text-white">
                    {t("app.settings.downloaders.discovery.monitor")}
                  </FormControlLabelText>
                </FormControlLabel>
                <Switch
                  size="md"
                  trackColor={{ false: gray500, true: emerald500 }}
                  thumbColor={white}
                  ios_backgroundColor={white}
                  value={monitorAdded}
                  onToggle={(value) => setAddDefaults({ monitorAdded: value })}
                />
              </HStack>
            </FormControl>

            <HStack className="items-center justify-center mt-4 mb-6">
              <FadeOutScaleDown
                onPress={() => sheetRef.current?.dismiss()}
                className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full"
              >
                <Text className="text-primary-800 font-bold text-lg">
                  {t("app.shared.done")}
                </Text>
              </FadeOutScaleDown>
            </HStack>
          </Box>
        </BottomSheetScrollView>
      </CenteredBottomSheetModal>

      <SelectBottomSheet
        sheetRef={qualitySheetRef}
        title={t("app.settings.downloaders.discovery.qualityProfile")}
        options={qualityProfiles.map((p) => ({
          label: p.name,
          value: String(p.id),
        }))}
        selectedValues={
          qualityProfileId != null ? [String(qualityProfileId)] : []
        }
        onSelect={(value) =>
          setAddDefaults({ qualityProfileId: Number(value) })
        }
      />
      <SelectBottomSheet
        sheetRef={metadataSheetRef}
        title={t("app.settings.downloaders.discovery.metadataProfile")}
        options={metadataProfiles.map((p) => ({
          label: p.name,
          value: String(p.id),
        }))}
        selectedValues={
          metadataProfileId != null ? [String(metadataProfileId)] : []
        }
        onSelect={(value) =>
          setAddDefaults({ metadataProfileId: Number(value) })
        }
      />
      <SelectBottomSheet
        sheetRef={rootSheetRef}
        title={t("app.settings.downloaders.discovery.rootFolder")}
        options={rootFolders.map((f) => ({ label: f.path, value: f.path }))}
        selectedValues={rootFolderPath ? [rootFolderPath] : []}
        onSelect={(value) => setAddDefaults({ rootFolderPath: value })}
      />
    </>
  );
}
