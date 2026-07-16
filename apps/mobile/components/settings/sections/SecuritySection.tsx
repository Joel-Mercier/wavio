import { type Href, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SettingsActionRow } from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";

export default function SecuritySection() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.security.title")}>
      <VStack className="gap-y-4">
        <SettingsActionRow
          label={t("app.settings.securitySettings.trustedCertificatesLabel")}
          description={t(
            "app.settings.securitySettings.trustedCertificatesDescription",
          )}
          actionLabel={t(
            "app.settings.securitySettings.trustedCertificatesAction",
          )}
          // Cast until expo-router regenerates typed routes for the new
          // screen on the next dev-server/prebuild run.
          onPress={() => router.navigate("/trusted-certificates" as Href)}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
