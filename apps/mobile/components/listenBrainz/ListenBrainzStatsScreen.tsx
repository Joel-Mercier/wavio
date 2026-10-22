import { useTranslation } from "react-i18next";
import ListenBrainzStatsContent from "@/components/listenBrainz/ListenBrainzStatsContent";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";

export default function ListenBrainzStatsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.listenbrainz.stats.title")}
    >
      <ListenBrainzStatsContent />
    </SettingsScreenScaffold>
  );
}
