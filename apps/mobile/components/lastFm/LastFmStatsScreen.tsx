import { useTranslation } from "react-i18next";
import LastFmStatsContent from "@/components/lastFm/LastFmStatsContent";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";

export default function LastFmStatsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsScreenScaffold
      title={t("app.settings.integrations.lastfm.stats.title")}
    >
      <LastFmStatsContent />
    </SettingsScreenScaffold>
  );
}
