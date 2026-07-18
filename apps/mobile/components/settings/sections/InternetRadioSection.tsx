import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import RadioFeedTagsSheet from "@/components/internetRadioStations/RadioFeedTagsSheet";
import SearchableSelectSheet from "@/components/internetRadioStations/SearchableSelectSheet";
import {
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";
import { useRadioCountries } from "@/hooks/radioBrowser/useRadioBrowser";
import useApp from "@/stores/app";

export default function InternetRadioSection() {
  const { t } = useTranslation();
  const [emerald500] = Uniwind.getCSSVariable([
    "--color-emerald-500",
  ]) as string[];
  const bottomSheetRadioCountryModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetRadioTagsModalRef = useRef<BottomSheetModal>(null);

  const internetRadioCountryCode = useApp(
    (store) => store.internetRadioCountryCode,
  );
  const setInternetRadioCountryCode = useApp(
    (store) => store.setInternetRadioCountryCode,
  );
  const internetRadioFeedTags = useApp((store) => store.internetRadioFeedTags);
  const radioBrowserEnabled = useApp((store) => store.radioBrowserEnabled);
  const setRadioBrowserEnabled = useApp(
    (store) => store.setRadioBrowserEnabled,
  );

  const { data: radioCountriesData } = useRadioCountries();
  const radioCountryOptions = useMemo(
    () =>
      (radioCountriesData ?? [])
        .filter((c) => c.iso_3166_1 && c.name)
        .map((c) => ({ label: c.name, value: c.iso_3166_1 })),
    [radioCountriesData],
  );
  const radioCountryBadgeText = useMemo(() => {
    if (!internetRadioCountryCode) {
      return t("app.settings.internetRadioStationsSettings.countryAutomatic");
    }
    return (
      radioCountryOptions.find((o) => o.value === internetRadioCountryCode)
        ?.label ?? internetRadioCountryCode
    );
  }, [internetRadioCountryCode, radioCountryOptions, t]);

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.radio.title")}
      overlays={
        <>
          <SearchableSelectSheet
            ref={bottomSheetRadioCountryModalRef}
            title={t("app.settings.internetRadioStationsSettings.countryLabel")}
            anyLabel={t(
              "app.settings.internetRadioStationsSettings.countryAutomatic",
            )}
            options={radioCountryOptions}
            selectedValue={internetRadioCountryCode ?? undefined}
            onSelect={(value) => {
              setInternetRadioCountryCode(value || null);
              bottomSheetRadioCountryModalRef.current?.dismiss();
            }}
            emerald={emerald500}
          />
          <RadioFeedTagsSheet modalRef={bottomSheetRadioTagsModalRef} />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsToggleRow
          label={t("app.settings.internetRadioStationsSettings.enabledLabel")}
          description={t(
            "app.settings.internetRadioStationsSettings.enabledDescription",
          )}
          value={radioBrowserEnabled}
          onToggle={(value) => setRadioBrowserEnabled(value)}
        />
        <SettingsSelectRow
          label={t("app.settings.internetRadioStationsSettings.countryLabel")}
          description={t(
            "app.settings.internetRadioStationsSettings.countryDescription",
          )}
          badgeText={radioCountryBadgeText}
          disabled={!radioBrowserEnabled}
          onPress={() => bottomSheetRadioCountryModalRef.current?.present()}
        />
        <SettingsSelectRow
          label={t("app.settings.internetRadioStationsSettings.tagsLabel")}
          description={t(
            "app.settings.internetRadioStationsSettings.tagsDescription",
          )}
          badgeText={t("app.settings.internetRadioStationsSettings.tagsCount", {
            count: internetRadioFeedTags.length,
          })}
          disabled={!radioBrowserEnabled}
          onPress={() => bottomSheetRadioTagsModalRef.current?.present()}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
