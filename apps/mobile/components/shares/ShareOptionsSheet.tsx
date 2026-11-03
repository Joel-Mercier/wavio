import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { type RefObject, useState } from "react";
import { useTranslation } from "react-i18next";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { SettingsToggleRow } from "@/components/settings/SettingsRows";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useNavidromeTranscodings,
  useShareDownloadsEnabled,
} from "@/hooks/navidrome/useShares";
import type { ShareLinkOptions } from "@/services/backend/sharing";
import { cn } from "@/utils/tailwind";

const BIT_RATE_OPTIONS = [64, 96, 128, 160, 192, 256, 320];
const DEFAULT_FORMAT = "mp3";
const DEFAULT_BIT_RATE = 192;

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <FadeOutScaleDown onPress={onPress}>
      <Badge
        className={cn("rounded-full bg-primary-500 px-4 py-1", {
          "bg-emerald-500": selected,
        })}
      >
        <BadgeText className="normal-case text-md text-white">
          {label}
        </BadgeText>
      </Badge>
    </FadeOutScaleDown>
  );
}

function ShareOptionsContent({
  onConfirm,
}: {
  onConfirm: (options: ShareLinkOptions) => void;
}) {
  const { t } = useTranslation();
  const { data: transcodings, isLoading } = useNavidromeTranscodings(true);
  const downloadsEnabled = useShareDownloadsEnabled(true);
  const [downloadable, setDownloadable] = useState(false);
  const [originalFormat, setOriginalFormat] = useState(true);
  const [pickedFormat, setPickedFormat] = useState<string | null>(null);
  const [maxBitRate, setMaxBitRate] = useState(DEFAULT_BIT_RATE);

  const formats = transcodings ?? [];
  const format =
    pickedFormat ??
    formats.find((transcoding) => transcoding.targetFormat === DEFAULT_FORMAT)
      ?.targetFormat ??
    formats[0]?.targetFormat;
  const canTranscode = !!format;

  const handleCreatePress = () => {
    onConfirm({
      transcode: !originalFormat && format ? { format, maxBitRate } : undefined,
      downloadable: downloadsEnabled ? downloadable : undefined,
    });
  };

  return (
    <Box className="p-6 w-full mb-12">
      <Heading className="text-white" size="lg">
        {t("app.shares.shareOptionsTitle")}
      </Heading>
      {downloadsEnabled ? (
        <SettingsToggleRow
          label={t("app.shares.downloadable")}
          description={t("app.shares.downloadableDescription")}
          value={downloadable}
          onToggle={setDownloadable}
        />
      ) : null}
      <SettingsToggleRow
        label={t("app.shares.originalFormat")}
        description={t("app.shares.originalFormatDescription")}
        value={originalFormat || !canTranscode}
        onToggle={setOriginalFormat}
        disabled={!canTranscode}
      />
      {isLoading ? <Spinner className="my-4" /> : null}
      {!originalFormat && canTranscode ? (
        <VStack className="gap-y-6 mt-2">
          <VStack className="gap-y-3">
            <Text className="text-lg text-gray-200">
              {t("app.shares.format")}
            </Text>
            <HStack className="flex-wrap gap-2">
              {formats.map((transcoding) => (
                <Chip
                  key={transcoding.id}
                  label={transcoding.name}
                  selected={transcoding.targetFormat === format}
                  onPress={() => setPickedFormat(transcoding.targetFormat)}
                />
              ))}
            </HStack>
          </VStack>
          <VStack className="gap-y-3">
            <Text className="text-lg text-gray-200">
              {t("app.shares.maxBitRate")}
            </Text>
            <HStack className="flex-wrap gap-2">
              {BIT_RATE_OPTIONS.map((bitrate) => (
                <Chip
                  key={bitrate}
                  label={t("app.shares.bitRateValue", { bitrate })}
                  selected={bitrate === maxBitRate}
                  onPress={() => setMaxBitRate(bitrate)}
                />
              ))}
            </HStack>
          </VStack>
        </VStack>
      ) : null}
      <FadeOutScaleDown
        onPress={handleCreatePress}
        className="items-center justify-center py-3 px-8 mt-8 border border-emerald-500 bg-emerald-500 rounded-full"
      >
        <Text className="text-primary-800 font-bold text-lg">
          {t("app.shares.create")}
        </Text>
      </FadeOutScaleDown>
    </Box>
  );
}

/**
 * Asks whether the share link is downloadable and which format it serves
 * before creating it, on servers that can transcode a share. The content only mounts while the sheet is open, so the
 * transcoding list is fetched on demand.
 */
export default function ShareOptionsSheet({
  sheetRef,
  onConfirm,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  onConfirm: (options: ShareLinkOptions) => void;
}) {
  const handleConfirm = (options: ShareLinkOptions) => {
    sheetRef.current?.dismiss();
    onConfirm(options);
  };

  return (
    <CenteredBottomSheetModal
      ref={sheetRef}
      enableHalfExpand={false}
      backgroundStyle={{
        backgroundColor: "rgb(41, 41, 41)",
      }}
      handleIndicatorStyle={{
        backgroundColor: "#b3b3b3",
      }}
    >
      <BottomSheetScrollView showsVerticalScrollIndicator={false}>
        <ShareOptionsContent onConfirm={handleConfirm} />
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
