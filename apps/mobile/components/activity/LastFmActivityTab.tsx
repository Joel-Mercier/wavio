import { useTranslation } from "react-i18next";
import StatsTabEmptyState from "@/components/activity/StatsTabEmptyState";
import LastFmStatsContent from "@/components/lastFm/LastFmStatsContent";
import { ScrollView } from "@/components/ui/scroll-view";
import { useLastFmEnabled } from "@/hooks/lastFm/useLastFmEnabled";
import { useLastFmUserInfo } from "@/hooks/lastFm/useLastFmStats";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";

const KEY = "app.activity.lastfm";

export default function LastFmActivityTab({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const { isEnabled } = useLastFmEnabled(true);
  const userInfo = useLastFmUserInfo({ enabled: isActive });

  if (!isEnabled) {
    return (
      <StatsTabEmptyState
        message={t(`${KEY}.notConnected`)}
        actionLabel={t(`${KEY}.connectAction`)}
        href="/integrations/lastfm"
        primary
      />
    );
  }

  if (userInfo.data?.playCount === 0) {
    return (
      <StatsTabEmptyState
        message={t(`${KEY}.noData`)}
        actionLabel={t(`${KEY}.settingsAction`)}
        href="/integrations/lastfm"
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: screenBottomPadding }}
    >
      <LastFmStatsContent isActive={isActive} />
    </ScrollView>
  );
}
