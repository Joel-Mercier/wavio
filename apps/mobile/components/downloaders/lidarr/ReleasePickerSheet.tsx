import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Ban from "lucide-react-native/dist/esm/icons/ban.mjs";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Uniwind } from "uniwind";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";
import EmptyDisplay from "@/components/EmptyDisplay";
import ErrorDisplay from "@/components/ErrorDisplay";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useGrabRelease, useReleases } from "@/hooks/lidarr/useReleases";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import type { LidarrRelease } from "@/services/lidarr";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { niceBytes } from "@/utils/fileSize";
import { cn } from "@/utils/tailwind";

export default function ReleasePickerSheet({
  sheetRef,
  albumId,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  albumId: number | undefined;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [emerald500, primary400] = Uniwind.getCSSVariable([
    "--color-emerald-500",
    "--color-primary-400",
  ]) as string[];
  const { data, isLoading, error } = useReleases(albumId);
  const grab = useGrabRelease();

  const handleGrab = (release: LidarrRelease) => {
    grab.mutate(release, {
      onSuccess: () => {
        showSuccessToast(t("app.settings.downloaders.release.grabbedMessage"));
        sheetRef.current?.dismiss();
      },
      onError: () =>
        showErrorToast(t("app.settings.downloaders.release.grabFailed")),
    });
  };

  const releases = data ?? [];
  const grabbingKey =
    grab.isPending && grab.variables
      ? `${grab.variables.guid}-${grab.variables.indexerId}`
      : null;

  return (
    <CenteredBottomSheetModal
      ref={sheetRef}
      snapPoints={["80%"]}
      backgroundStyle={{ backgroundColor: "rgb(41, 41, 41)" }}
      handleIndicatorStyle={{ backgroundColor: "#b3b3b3" }}
    >
      <Box className="px-6 pt-2 pb-3">
        <Heading className="text-white" size="lg">
          {t("app.settings.downloaders.release.title")}
        </Heading>
        <Text className="text-primary-100 text-sm mt-1">
          {t("app.settings.downloaders.release.description")}
        </Text>
      </Box>
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      >
        {isLoading ? (
          <VStack className="items-center py-10 gap-y-3">
            <ActivityIndicator color={emerald500} />
            <Text className="text-primary-100 text-sm">
              {t("app.settings.downloaders.release.searching")}
            </Text>
          </VStack>
        ) : error ? (
          <ErrorDisplay error={error} />
        ) : releases.length === 0 ? (
          <EmptyDisplay />
        ) : (
          releases.map((release) => {
            const rowKey = `${release.guid}-${release.indexerId}`;
            const isGrabbing = rowKey === grabbingKey;
            const disabled =
              grab.isPending ||
              release.rejected ||
              release.downloadAllowed === false;
            const meta = [
              release.quality?.quality?.name,
              release.size ? niceBytes(release.size) : undefined,
              release.protocol === "torrent" && release.seeders != null
                ? t("app.settings.downloaders.release.seeders", {
                    count: release.seeders,
                  })
                : undefined,
              release.indexer,
            ].filter(Boolean);
            return (
              <FadeOutScaleDown
                key={rowKey}
                onPress={() => !disabled && handleGrab(release)}
                disabled={disabled}
                className={cn("px-6 py-3", disabled && "opacity-50")}
              >
                <HStack className="items-center gap-x-3">
                  <VStack className="flex-1">
                    <Text className="text-white text-sm" numberOfLines={2}>
                      {decodeHtmlEntities(release.title)}
                    </Text>
                    <Text
                      className="text-primary-100 text-xs mt-1"
                      numberOfLines={1}
                    >
                      {meta.join(" · ")}
                    </Text>
                    {release.rejected && release.rejections?.[0] && (
                      <Text
                        className="text-red-400 text-xs mt-1"
                        numberOfLines={1}
                      >
                        {decodeHtmlEntities(release.rejections[0])}
                      </Text>
                    )}
                  </VStack>
                  {isGrabbing ? (
                    <Spinner color={emerald500} />
                  ) : release.rejected ? (
                    <Ban size={18} color={primary400} />
                  ) : null}
                </HStack>
              </FadeOutScaleDown>
            );
          })
        )}
      </BottomSheetScrollView>
    </CenteredBottomSheetModal>
  );
}
