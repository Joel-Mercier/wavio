import { useTranslation } from "react-i18next";
import HomeSection from "@/components/home/sections/HomeSection";
import InternetRadioStationListItem, {
  serverToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import InternetRadioStationListItemSkeleton from "@/components/internetRadioStations/InternetRadioStationListItemSkeleton";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";
import { loadingData } from "@/utils/loadingData";

interface InternetRadioSectionProps {
  enabled: boolean;
}

export default function InternetRadioSection({
  enabled,
}: InternetRadioSectionProps) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useGetInternetRadioStations({ enabled });
  const stations = data?.internetRadioStations?.internetRadioStation?.slice(
    0,
    12,
  );
  return (
    <HomeSection
      title={t("app.home.internetRadioStations")}
      seeAllHref="/(app)/(tabs)/(home)/internet-radio-stations"
      isLoading={!enabled || isLoading}
      error={error}
      isEmpty={!stations?.length}
      skeleton={loadingData(4).map((_, index) => (
        <InternetRadioStationListItemSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
          key={`internet-radio-skeleton-${index}`}
        />
      ))}
    >
      {stations?.map((station) => (
        <InternetRadioStationListItem
          key={station.id}
          station={serverToItem(station)}
        />
      ))}
    </HomeSection>
  );
}
