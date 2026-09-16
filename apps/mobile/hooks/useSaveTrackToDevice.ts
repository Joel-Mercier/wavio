import { useTranslation } from "react-i18next";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { isTlsTrustFailure } from "@/services/errorReporting";
import { saveTrackToDevice } from "@/services/saveTrackToDevice";
import { logError } from "@/utils/log";

type SavableTrack = Parameters<typeof saveTrackToDevice>[0];

export function useSaveTrackToDevice() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();

  return async (track: SavableTrack) => {
    try {
      const outcome = await saveTrackToDevice(track);
      if (outcome === "saved") {
        showSuccessToast(t("app.tracks.downloadSuccessMessage"));
      }
    } catch (error) {
      logError("Error downloading track to device:", error);
      showErrorToast(
        t(
          isTlsTrustFailure(error)
            ? "app.tracks.downloadErrorCertificateMessage"
            : "app.tracks.downloadErrorMessage",
        ),
      );
    }
  };
}
