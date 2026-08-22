import { useTranslation } from "react-i18next";
import StatTopList, {
  StatTopListSkeleton,
} from "@/components/listenBrainz/StatTopList";
import type { CountryStat } from "@/services/listenBrainz/statsMappers";
import { countryName } from "@/utils/countries";

/**
 * Where the artists you listen to are from, as a ranked list.
 *
 * ListenBrainz draws this as a world map; a choropleth on a phone is a lot of
 * pixels to say "mostly the US and the UK", so the same data is ranked instead
 * — which also puts the numbers in reach of a screen reader.
 */
export default function ArtistOriginsList({
  countries,
}: {
  countries: CountryStat[];
}) {
  const { t, i18n } = useTranslation();

  return (
    <StatTopList
      items={countries.map((country) => ({
        key: country.key,
        rank: country.rank,
        title: countryName(country.code, i18n.language),
        subtitle: t(
          "app.settings.integrations.listenbrainz.stats.artistCount",
          { count: country.artistCount },
        ),
        listenCount: country.listenCount,
      }))}
    />
  );
}

export function ArtistOriginsListSkeleton() {
  return <StatTopListSkeleton />;
}
