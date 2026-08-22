import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ArtistEvolutionChart, {
  ArtistEvolutionChartSkeleton,
} from "@/components/listenBrainz/ArtistEvolutionChart";
import ArtistOriginsList, {
  ArtistOriginsListSkeleton,
} from "@/components/listenBrainz/ArtistOriginsList";
import DailyActivityHeatmap, {
  DailyActivityHeatmapSkeleton,
} from "@/components/listenBrainz/DailyActivityHeatmap";
import DecadeActivityChart, {
  DecadeActivityChartSkeleton,
} from "@/components/listenBrainz/DecadeActivityChart";
import GenreActivityHeatmap, {
  GenreActivityHeatmapSkeleton,
} from "@/components/listenBrainz/GenreActivityHeatmap";
import ListeningActivityChart, {
  ListeningActivityChartSkeleton,
} from "@/components/listenBrainz/ListeningActivityChart";
import StatsSection from "@/components/listenBrainz/StatsSection";
import StatTopList, {
  StatTopListSkeleton,
} from "@/components/listenBrainz/StatTopList";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import TabBar from "@/components/TabBar";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import i18n from "@/config/i18n";
import {
  useListenBrainzArtistCountries,
  useListenBrainzArtistEvolution,
  useListenBrainzDailyActivity,
  useListenBrainzEraActivity,
  useListenBrainzGenreActivity,
  useListenBrainzListenCount,
  useListenBrainzListeningActivity,
  useListenBrainzTopArtists,
  useListenBrainzTopRecordings,
  useListenBrainzTopReleases,
} from "@/hooks/listenBrainz/useListenBrainzStats";
import type { StatsRange } from "@/services/listenBrainz/types";
import useListenBrainz from "@/stores/listenBrainz";
import { formatDistanceToNow } from "@/utils/date";

// Four of the API's nine ranges. One range drives the whole screen rather than
// one per section: the sections already disagree about which ranges they have
// data for, and six independent pickers would make that the user's problem.
const RANGES: StatsRange[] = ["week", "month", "year", "all_time"];

const KEY = "app.settings.integrations.listenbrainz.stats";

export default function ListenBrainzStatsScreen() {
  const { t } = useTranslation();
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex];
  const userName = useListenBrainz((store) => store.userName);

  const listenCount = useListenBrainzListenCount();
  const topArtists = useListenBrainzTopArtists(range);
  const topReleases = useListenBrainzTopReleases(range);
  const topRecordings = useListenBrainzTopRecordings(range);
  const listeningActivity = useListenBrainzListeningActivity(range);
  const dailyActivity = useListenBrainzDailyActivity(range);
  const eraActivity = useListenBrainzEraActivity(range);
  const genreActivity = useListenBrainzGenreActivity(range);
  const artistEvolution = useListenBrainzArtistEvolution(range);
  const artistCountries = useListenBrainzArtistCountries(range);

  const tabs = useMemo(
    () =>
      RANGES.map((value) => ({
        key: value,
        title: t(`${KEY}.ranges.${value}`),
      })),
    [t],
  );

  // The freshest timestamp any section reported. They are recomputed in the
  // same batch, so one figure honestly describes the screen.
  const lastUpdated = useMemo(() => {
    const stamps = [
      topArtists.data,
      topReleases.data,
      topRecordings.data,
      listeningActivity.data,
      dailyActivity.data,
      eraActivity.data,
      genreActivity.data,
      artistEvolution.data,
      artistCountries.data,
    ]
      .map((result) =>
        result?.state === "ready" ? (result.lastUpdated ?? 0) : 0,
      )
      .filter((stamp) => stamp > 0);
    return stamps.length ? Math.max(...stamps) : null;
  }, [
    topArtists.data,
    topReleases.data,
    topRecordings.data,
    listeningActivity.data,
    dailyActivity.data,
    eraActivity.data,
    genreActivity.data,
    artistEvolution.data,
    artistCountries.data,
  ]);

  return (
    <SettingsScreenScaffold title={t(`${KEY}.title`)}>
      <VStack className="gap-y-2">
        <VStack className="gap-y-1">
          <Heading className="text-white" size="2xl">
            {listenCount.data === undefined
              ? "—"
              : t(`${KEY}.listens`, {
                  count: listenCount.data,
                  formattedCount: listenCount.data.toLocaleString(
                    i18n.language,
                  ),
                })}
          </Heading>
          {userName && (
            <Text className="text-primary-100 text-sm">
              {t("app.settings.integrations.listenbrainz.signedInAs", {
                userName,
              })}
            </Text>
          )}
        </VStack>

        <TabBar
          tabs={tabs}
          activeIndex={rangeIndex}
          onTabPress={setRangeIndex}
          className="bg-transparent px-0 mt-2"
        />

        <StatsSection
          title={t(`${KEY}.topArtists`)}
          query={topArtists}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton />}
        >
          {(items) => <StatTopList items={items} />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.topAlbums`)}
          query={topReleases}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton showArtwork />}
        >
          {(items) => <StatTopList items={items} showArtwork />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.topTracks`)}
          query={topRecordings}
          isEmpty={(items) => items.length === 0}
          skeleton={<StatTopListSkeleton showArtwork />}
        >
          {(items) => <StatTopList items={items} showArtwork />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.listeningActivity`)}
          query={listeningActivity}
          isEmpty={(buckets) => buckets.length === 0}
          skeleton={<ListeningActivityChartSkeleton />}
        >
          {(buckets) => (
            <ListeningActivityChart buckets={buckets} range={range} />
          )}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.dailyActivity`)}
          description={t(`${KEY}.dailyActivityDescription`)}
          query={dailyActivity}
          isEmpty={(grid) => grid.max === 0}
          skeleton={<DailyActivityHeatmapSkeleton />}
        >
          {(grid) => <DailyActivityHeatmap grid={grid} />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.genreActivity`)}
          description={t(`${KEY}.genreActivityDescription`)}
          query={genreActivity}
          isEmpty={(grid) => grid.max === 0}
          skeleton={<GenreActivityHeatmapSkeleton />}
        >
          {(grid) => <GenreActivityHeatmap grid={grid} />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.musicByDecade`)}
          description={t(`${KEY}.musicByDecadeDescription`)}
          query={eraActivity}
          isEmpty={(buckets) => buckets.length === 0}
          skeleton={<DecadeActivityChartSkeleton />}
        >
          {(buckets) => <DecadeActivityChart buckets={buckets} />}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.artistEvolution`)}
          description={t(`${KEY}.artistEvolutionDescription`)}
          query={artistEvolution}
          isEmpty={(evolution) => evolution.series.length === 0}
          skeleton={<ArtistEvolutionChartSkeleton />}
        >
          {(evolution) => (
            <ArtistEvolutionChart evolution={evolution} range={range} />
          )}
        </StatsSection>

        <StatsSection
          title={t(`${KEY}.artistOrigins`)}
          query={artistCountries}
          isEmpty={(countries) => countries.length === 0}
          skeleton={<ArtistOriginsListSkeleton />}
        >
          {(countries) => <ArtistOriginsList countries={countries} />}
        </StatsSection>

        {lastUpdated && (
          <Text className="text-primary-300 text-xs mt-4">
            {t(`${KEY}.lastUpdated`, {
              time: formatDistanceToNow(new Date(lastUpdated * 1000)),
            })}
          </Text>
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
