import { useTranslation } from "react-i18next";
import StatsTabEmptyState from "@/components/activity/StatsTabEmptyState";
import ListenBrainzStatsContent from "@/components/listenBrainz/ListenBrainzStatsContent";
import { ScrollView } from "@/components/ui/scroll-view";
import { useListenBrainzEnabled } from "@/hooks/listenBrainz/useListenBrainzEnabled";
import { useListenBrainzListenCount } from "@/hooks/listenBrainz/useListenBrainzStats";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";

const KEY = "app.activity.listenbrainz";

export default function ListenBrainzActivityTab({
  isActive,
}: {
  isActive: boolean;
}) {
  const { t } = useTranslation();
  const screenBottomPadding = useScreenBottomPadding();
  const { isEnabled } = useListenBrainzEnabled(true);
  const listenCount = useListenBrainzListenCount({ enabled: isActive });

  if (!isEnabled) {
    return (
      <StatsTabEmptyState
        message={t(`${KEY}.notConnected`)}
        actionLabel={t(`${KEY}.connectAction`)}
        href="/integrations/listenbrainz"
        primary
      />
    );
  }

  if (listenCount.data === 0) {
    return (
      <StatsTabEmptyState
        message={t(`${KEY}.noData`)}
        actionLabel={t(`${KEY}.settingsAction`)}
        href="/integrations/listenbrainz"
      />
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: screenBottomPadding }}
    >
      <ListenBrainzStatsContent isActive={isActive} />
    </ScrollView>
  );
}
