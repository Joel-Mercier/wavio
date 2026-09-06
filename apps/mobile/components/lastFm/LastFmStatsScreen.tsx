import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RecentTracksList, {
  RecentTracksListSkeleton,
} from "@/components/lastFm/RecentTracksList";
import StatsSection from "@/components/scrobbling/StatsSection";
import StatTopList, {
  StatTopListSkeleton,
} from "@/components/scrobbling/StatTopList";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import TabBar from "@/components/TabBar";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import i18n from "@/config/i18n";
import {
  useLastFmRecentTracks,
  useLastFmTopAlbums,
  useLastFmTopArtists,
  useLastFmTopTracks,
  useLastFmUserInfo,
} from "@/hooks/lastFm/useLastFmStats";
import type { LastFmPeriod } from "@/services/lastFm/types";
import { format } from "@/utils/date";

// Four of the API's seven periods, chosen to line up with the four ranges the
// ListenBrainz screen offers so the two read the same. As there, one picker
// drives the whole screen.
const PERIODS: LastFmPeriod[] = ["7day", "1month", "12month", "overall"];

const KEY = "app.settings.integrations.lastfm.stats";

export default function LastFmStatsScreen() {
  const { t } = useTranslation();
  const [periodIndex, setPeriodIndex] = useState(0);
  const period = PERIODS[periodIndex];

  const userInfo = useLastFmUserInfo();
  const topArtists = useLastFmTopArtists(period);
  const topAlbums = useLastFmTopAlbums(period);
  const topTracks = useLastFmTopTracks(period);
  const recentTracks = useLastFmRecentTracks();

  // Last.fm computes on read, so there is no notComputed state to describe —
  // missing data here really does mean "nothing scrobbled".
  const labels = useMemo(
    () => ({
      unreachable: t(`${KEY}.unreachable`),
      noData: t(`${KEY}.noData`),
    }),
    [t],
  );

  const tabs = useMemo(
    () =>
      PERIODS.map((value) => ({
        key: value,
        title: t(`${KEY}.ranges.${value}`),
      })),
    [t],
  );

  return (
    <SettingsScreenScaffold title={t(`${KEY}.title`)}>
      <VStack className="gap-y-2">
        <VStack className="gap-y-1">
          <Heading className="text-white" size="2xl">
            {userInfo.data === undefined
              ? "—"
              : t(`${KEY}.scrobbles`, {
                  count: userInfo.data.playCount,
                  formattedCount: userInfo.data.playCount.toLocaleString(
                    i18n.language,
                  ),
                })}
          </Heading>
          {userInfo.data && (
            <Text className="text-primary-100 text-sm">
              {t("app.settings.integrations.lastfm.auth.signedInAs", {
                userName: userInfo.data.name,
              })}
            </Text>
          )}
          {userInfo.data?.registeredAt && (
            <Text className="text-primary-300 text-xs">
              {t(`${KEY}.since`, {
                date: format(new Date(userInfo.data.registeredAt * 1000), "PP"),
              })}
            </Text>
          )}
        </VStack>

        <TabBar
          tabs={tabs}
          activeIndex={periodIndex}
          onTabPress={setPeriodIndex}
          className="bg-transparent px-0 mt-2"
        />

        <StatsSection
          labels={labels}
          title={t(`${KEY}.topArtists`)}
          query={topArtists}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton />}
        >
          {(items) => <StatTopList items={items} />}
        </StatsSection>

        <StatsSection
          labels={labels}
          title={t(`${KEY}.topAlbums`)}
          query={topAlbums}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton showArtwork />}
        >
          {(items) => <StatTopList items={items} showArtwork />}
        </StatsSection>

        <StatsSection
          labels={labels}
          title={t(`${KEY}.topTracks`)}
          query={topTracks}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton showArtwork />}
        >
          {(items) => <StatTopList items={items} showArtwork />}
        </StatsSection>

        {/* Outside the period tabs on purpose: user.getRecentTracks has no
            period parameter, so this list is the same whichever tab is active. */}
        <StatsSection
          labels={labels}
          title={t(`${KEY}.recentTracks`)}
          description={t(`${KEY}.recentTracksDescription`)}
          query={recentTracks}
          isEmpty={(tracks) => tracks.length === 0}
          skeleton={<RecentTracksListSkeleton />}
        >
          {(tracks) => <RecentTracksList tracks={tracks} />}
        </StatsSection>

        {/* Required by the Last.fm API terms of service (clause 2.7). */}
        <FadeOutScaleDown
          onPress={() => {
            void Linking.openURL(userInfo.data?.url ?? "https://www.last.fm/");
          }}
          className="self-start mt-6"
        >
          <Text className="text-primary-100 text-xs underline">
            {t("app.settings.integrations.lastfm.attribution")}
          </Text>
        </FadeOutScaleDown>
      </VStack>
    </SettingsScreenScaffold>
  );
}
