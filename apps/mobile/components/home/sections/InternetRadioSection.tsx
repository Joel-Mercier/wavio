import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useSectionEnabled } from "@/components/home/enabledSections";
import HomeSection from "@/components/home/sections/HomeSection";
import { INTERNET_RADIO_CAROUSEL_SKELETON } from "@/components/home/sections/skeletons";
import InternetRadioStationListItem, {
  serverToItem,
} from "@/components/internetRadioStations/InternetRadioStationListItem";
import { useGetInternetRadioStations } from "@/hooks/backend/useInternetRadioStations";

interface InternetRadioSectionProps {
  sectionIndex: number;
}

function InternetRadioSection({ sectionIndex }: InternetRadioSectionProps) {
  const enabled = useSectionEnabled(sectionIndex);
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
      skeleton={INTERNET_RADIO_CAROUSEL_SKELETON}
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

export default memo(InternetRadioSection);
