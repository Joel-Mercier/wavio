import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, ScrollView } from "react-native";
import SettingsNotice from "@/components/settings/SettingsNotice";
import { SettingsActionRow } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import { buildBugReport, NEW_ISSUE_URL } from "@/services/bugReport";
import {
  isUpnpTraceAvailable,
  isUpnpTracing,
  setUpnpTracing,
  shareUpnpTrace,
} from "@/services/upnpTrace";

const MONOSPACE = {
  fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
};

export default function SupportSection() {
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast } = useSettingsToast();
  const [preview, setPreview] = useState<string | null>(null);
  const [tracing, setTracing] = useState(isUpnpTracing);

  const toggleTracing = () => {
    const next = setUpnpTracing(!tracing);
    setTracing(next);
    showSuccessToast(
      t(
        next
          ? "app.settings.supportSettings.castingLogStarted"
          : "app.settings.supportSettings.castingLogStopped",
      ),
    );
  };

  const onShareTrace = async () => {
    let shared = false;
    try {
      shared = await shareUpnpTrace(buildBugReport());
    } catch {
      shared = false;
    }
    if (!shared)
      showErrorToast(t("app.settings.supportSettings.castingLogEmpty"));
  };

  const copyReport = async () => {
    try {
      const report = buildBugReport();
      await Clipboard.setStringAsync(report);
      return report;
    } catch {
      showErrorToast(t("app.settings.supportSettings.copyError"));
      return null;
    }
  };

  const onCopy = async () => {
    if (await copyReport()) {
      showSuccessToast(t("app.settings.supportSettings.copySuccess"));
    }
  };

  const onOpenIssue = async () => {
    if (!(await copyReport())) return;
    showSuccessToast(t("app.settings.supportSettings.copySuccessOpening"));
    Linking.openURL(NEW_ISSUE_URL).catch(() => {});
  };

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.support.title")}>
      <VStack className="gap-y-4">
        <SettingsActionRow
          label={t("app.settings.supportSettings.openIssueLabel")}
          description={t("app.settings.supportSettings.openIssueDescription")}
          actionLabel={t("app.settings.supportSettings.openIssueAction")}
          onPress={onOpenIssue}
        />
        <SettingsActionRow
          label={t("app.settings.supportSettings.copyLabel")}
          description={t("app.settings.supportSettings.copyDescription")}
          actionLabel={t("app.settings.supportSettings.copyAction")}
          onPress={onCopy}
        />
        <SettingsActionRow
          label={t("app.settings.supportSettings.previewLabel")}
          description={t("app.settings.supportSettings.previewDescription")}
          actionLabel={
            preview === null
              ? t("app.settings.supportSettings.previewShow")
              : t("app.settings.supportSettings.previewHide")
          }
          onPress={() => setPreview(preview === null ? buildBugReport() : null)}
        />
        <SettingsNotice
          tone="info"
          message={t("app.settings.supportSettings.privacyNotice")}
        />
        {isUpnpTraceAvailable() && (
          <>
            <SettingsActionRow
              label={t("app.settings.supportSettings.castingLogLabel")}
              description={t(
                "app.settings.supportSettings.castingLogDescription",
              )}
              actionLabel={
                tracing
                  ? t("app.settings.supportSettings.castingLogStop")
                  : t("app.settings.supportSettings.castingLogStart")
              }
              onPress={toggleTracing}
            />
            <SettingsActionRow
              label={t("app.settings.supportSettings.castingLogShareLabel")}
              description={t(
                "app.settings.supportSettings.castingLogShareDescription",
              )}
              actionLabel={t(
                "app.settings.supportSettings.castingLogShareAction",
              )}
              onPress={onShareTrace}
            />
          </>
        )}
        {preview !== null && (
          <ScrollView
            horizontal
            className="rounded-md bg-primary-800 p-3"
            contentContainerClassName="pr-6"
          >
            <Text
              selectable
              className="text-primary-100 text-xs"
              style={MONOSPACE}
            >
              {preview}
            </Text>
          </ScrollView>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
