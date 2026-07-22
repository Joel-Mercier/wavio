import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Heading } from "@/components/ui/heading";
import { Progress, ProgressFilledTrack } from "@/components/ui/progress";
import { Text } from "@/components/ui/text";
import type { UpdateStatus } from "@/hooks/useAppUpdate";
import type { GithubUpdate } from "@/services/appUpdate";
import { releasesPageUrl } from "@/services/appUpdate";

// Renders the github-updater flow (available → downloading → installing / error)
// on the shared AlertDialog primitives. Store builds don't use this — the native
// overlay handles them.
export default function UpdateAvailableDialog({
  status,
  update,
  progress,
  onUpdate,
  onDismiss,
}: {
  status: UpdateStatus;
  update: GithubUpdate | null;
  progress: number;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const isOpen =
    update != null &&
    (status === "available" ||
      status === "downloading" ||
      status === "installing" ||
      status === "error");

  if (!update) return null;

  const isBusy = status === "downloading" || status === "installing";
  const changelog = update.release.body?.trim();
  // No APK matched this device's ABI — the only action we can offer is the
  // releases page in the browser.
  const canInstall = update.asset != null;

  return (
    <AlertDialog
      isOpen={isOpen}
      onClose={isBusy ? () => {} : onDismiss}
      size="md"
    >
      <AlertDialogBackdrop />
      <AlertDialogContent className="bg-primary-800 border-primary-400">
        <AlertDialogHeader>
          <Heading className="text-white font-bold" size="md">
            {t("app.update.title", { version: update.version })}
          </Heading>
        </AlertDialogHeader>
        <AlertDialogBody className="mt-3 mb-4">
          {status === "error" ? (
            <Text className="text-primary-50" size="sm">
              {t("app.update.errorDescription")}
            </Text>
          ) : status === "downloading" ? (
            <>
              <Text className="text-primary-50 mb-3" size="sm">
                {t("app.update.downloading", {
                  percent: Math.round(progress * 100),
                })}
              </Text>
              <Progress value={progress * 100} className="bg-primary-600">
                <ProgressFilledTrack className="bg-emerald-500" />
              </Progress>
            </>
          ) : status === "installing" ? (
            <Text className="text-primary-50" size="sm">
              {t("app.update.installing")}
            </Text>
          ) : (
            <>
              <Text className="text-primary-50" size="sm">
                {t("app.update.description")}
              </Text>
              {changelog ? (
                <Text
                  className="text-primary-100 mt-3"
                  size="xs"
                  numberOfLines={8}
                >
                  {changelog}
                </Text>
              ) : null}
              <Text
                className="text-emerald-500 underline mt-3"
                size="sm"
                onPress={() => Linking.openURL(update.release.html_url)}
              >
                {t("app.update.viewFullRelease")}
              </Text>
            </>
          )}
        </AlertDialogBody>
        {!isBusy && (
          <AlertDialogFooter className="items-center justify-center">
            <FadeOutScaleDown
              onPress={
                status === "error"
                  ? () => Linking.openURL(releasesPageUrl)
                  : onDismiss
              }
              className="items-center justify-center py-3 px-8 border border-white rounded-full mr-4"
            >
              <Text className="text-white font-bold text-lg">
                {status === "error"
                  ? t("app.update.openBrowser")
                  : t("app.update.later")}
              </Text>
            </FadeOutScaleDown>
            <FadeOutScaleDown
              onPress={
                status !== "error" && !canInstall
                  ? () => Linking.openURL(releasesPageUrl)
                  : onUpdate
              }
              className="items-center justify-center py-3 px-8 border border-emerald-500 bg-emerald-500 rounded-full ml-4"
            >
              <Text className="text-primary-800 font-bold text-lg">
                {status === "error"
                  ? t("app.update.retry")
                  : canInstall
                    ? t("app.update.update")
                    : t("app.update.openBrowser")}
              </Text>
            </FadeOutScaleDown>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
