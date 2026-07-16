import { useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns/parseISO";
import { useTranslation } from "react-i18next";
import { SettingsActionRow } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Badge, BadgeText } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  useGetScanStatus,
  useStartScan,
} from "@/hooks/backend/useMediaLibraryScanning";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { isSubsonicNotAuthorized } from "@/services/openSubsonic";
import { useAuthBase } from "@/stores/auth";
import useLocalLibrary from "@/stores/localLibrary";
import { formatDistanceToNow } from "@/utils/date";
import { logError } from "@/utils/log";

export default function MusicLibrarySection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const isLocal = useAuthBase((store) => store.serverType === "local");
  const serverType = useAuthBase((store) => store.serverType);
  const hasNavidromeNative = useAuthBase((store) => store.hasNavidromeNative);
  const isAdmin = useAuthBase((store) => store.isAdmin);
  // Navidrome restricts startScan to admins (code 50 otherwise). When native
  // login confirmed a non-admin account, disable the scan action up front. When
  // native login didn't run (pure OpenSubsonic / fallback), isAdmin is
  // unreliable, so leave it enabled and let the error toast explain a failure.
  const scanRequiresAdmin =
    serverType === "navidrome" && hasNavidromeNative && !isAdmin;
  const doStartScan = useStartScan();
  const { data } = useGetScanStatus();

  const handleMediaLibraryScanPress = () => {
    // Local mode: re-open the full-screen indexing gate, which runs a forced
    // full re-extraction (with live progress) rather than the background
    // incremental scan — so new tag fields land on already-indexed files.
    if (isLocal) {
      useLocalLibrary.getState().requestRescan();
      return;
    }
    doStartScan.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        showSuccessToast(
          t(
            "app.settings.musicLibrarySettings.scanMusicLibrarySuccessDescription",
          ),
        );
      },
      onError: (error) => {
        logError(error);
        // Navidrome (and other Subsonic servers) return code 50 when a non-admin
        // triggers a scan — tell the user admin rights are required rather than
        // showing the generic failure message.
        showErrorToast(
          t(
            isSubsonicNotAuthorized(error)
              ? "app.settings.musicLibrarySettings.scanMusicLibraryAdminRequiredDescription"
              : "app.settings.musicLibrarySettings.scanMusicLibraryErrorDescription",
          ),
        );
      },
    });
  };

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.library.title")}>
      <VStack className="gap-y-4">
        <SettingsActionRow
          layout="wide"
          label={t("app.settings.musicLibrarySettings.scanMusicLibraryLabel")}
          description={t(
            scanRequiresAdmin
              ? "app.settings.musicLibrarySettings.scanMusicLibraryAdminRequiredDescription"
              : "app.settings.musicLibrarySettings.scanMusicLibraryDescription",
          )}
          actionLabel={t(
            "app.settings.musicLibrarySettings.scanMusicLibraryAction",
          )}
          onPress={handleMediaLibraryScanPress}
          disabled={scanRequiresAdmin}
        />
        {!isLocal && (
          <HStack className="items-center gap-x-4 py-4 justify-between">
            <VStack className="gap-y-2 w-3/5">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.musicLibrarySettings.scanStatusLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.musicLibrarySettings.scanStatusDescription")}
              </Text>
              {data?.scanStatus?.lastScan && (
                <Text className="text-primary-100 text-sm">
                  {t("app.settings.musicLibrarySettings.scanStatusLastScan", {
                    lastScan: formatDistanceToNow(
                      parseISO(data?.scanStatus?.lastScan || ""),
                    ),
                  })}
                </Text>
              )}
            </VStack>
            <Badge
              className="rounded-full normal-case py-1 px-3 bg-emerald-100"
              size="lg"
              variant="solid"
              action={data?.scanStatus?.scanning ? "warning" : "success"}
            >
              <BadgeText className="normal-case text-center text-emerald-700">
                {data?.scanStatus?.scanning
                  ? t("app.settings.musicLibrarySettings.scanStatuses.scanning")
                  : t("app.settings.musicLibrarySettings.scanStatuses.idle")}
              </BadgeText>
            </Badge>
          </HStack>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
