import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeSectionsSheet from "@/components/settings/HomeSectionsSheet";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import {
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Divider } from "@/components/ui/divider";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { LanguageNames, SupportedLanguages } from "@/config/i18n";
import { useCapabilities } from "@/hooks/useCapabilities";
import useApp, { type SwipeAction } from "@/stores/app";
import { HOME_SECTION_CATALOG } from "@/utils/homeFeed";

const lyricsSourceOptions: ("off" | "server" | "all")[] = [
  "off",
  "server",
  "all",
];

const swipeActionOptions: SwipeAction[] = [
  "off",
  "addToQueue",
  "playNext",
  "rate",
  "showInfo",
  "addToPlaylist",
];

export default function AppearanceSection() {
  const { t } = useTranslation();
  const capabilities = useCapabilities();
  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetLyricsSourceModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetSwipeActionModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetHomeSectionsModalRef = useRef<BottomSheetModal>(null);

  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const showAddTab = useApp((store) => store.showAddTab);
  const setShowAddTab = useApp((store) => store.setShowAddTab);
  const showEmptyHomeSections = useApp((store) => store.showEmptyHomeSections);
  const setShowEmptyHomeSections = useApp(
    (store) => store.setShowEmptyHomeSections,
  );
  const hiddenHomeSections = useApp((store) => store.hiddenHomeSections);
  const visibleHomeSectionCount = useMemo(
    () =>
      HOME_SECTION_CATALOG.filter(
        (entry) =>
          (!entry.capability || capabilities[entry.capability]) &&
          !hiddenHomeSections.includes(entry.key),
      ).length,
    [capabilities, hiddenHomeSections],
  );
  const lyricsSource = useApp((store) => store.lyricsSource);
  const setLyricsSource = useApp((store) => store.setLyricsSource);
  const swipeLeftAction = useApp((store) => store.swipeLeftAction);
  const setSwipeLeftAction = useApp((store) => store.setSwipeLeftAction);
  const hapticFeedbackEnabled = useApp((store) => store.hapticFeedbackEnabled);
  const setHapticFeedbackEnabled = useApp(
    (store) => store.setHapticFeedbackEnabled,
  );

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.appearance.title")}
      overlays={
        <>
          <OptionsBottomSheetModal
            modalRef={bottomSheetLanguageModalRef}
            header={t("app.settings.displaySettings.languageLabel")}
            headerDescription={t(
              "app.settings.displaySettings.languageDescription",
            )}
            options={SupportedLanguages.map((language) => ({
              value: language,
              label: LanguageNames[language],
            }))}
            selectedValue={locale}
            onSelect={setLocale}
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetLyricsSourceModalRef}
            header={t("app.settings.displaySettings.lyricsSourceLabel")}
            headerDescription={t(
              "app.settings.displaySettings.lyricsSourceDescription",
            )}
            options={lyricsSourceOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.displaySettings.lyricsSourceOptions.${option}`,
              ),
            }))}
            selectedValue={lyricsSource}
            onSelect={setLyricsSource}
            dismissOnSelect
          />
          <OptionsBottomSheetModal
            modalRef={bottomSheetSwipeActionModalRef}
            header={t("app.settings.displaySettings.swipeActionLabel")}
            headerDescription={t(
              "app.settings.displaySettings.swipeActionDescription",
            )}
            options={swipeActionOptions.map((option) => ({
              value: option,
              label: t(
                `app.settings.displaySettings.swipeActionOptions.${option}`,
              ),
            }))}
            selectedValue={swipeLeftAction}
            onSelect={setSwipeLeftAction}
            dismissOnSelect
          />
          <HomeSectionsSheet modalRef={bottomSheetHomeSectionsModalRef} />
        </>
      }
    >
      <VStack className="gap-y-4">
        <SettingsSectionTitle title={t("app.settings.displaySettings.title")} />
        <FadeOutScaleDown
          onPress={() => bottomSheetLanguageModalRef.current?.present()}
        >
          <HStack className="items-center gap-x-4 py-4">
            <VStack className="gap-y-2">
              <Heading className="text-white font-normal" size="md">
                {t("app.settings.displaySettings.languageLabel")}
              </Heading>
              <Text className="text-primary-100 text-sm">
                {t("app.settings.displaySettings.languageDescription")}
              </Text>
            </VStack>
          </HStack>
        </FadeOutScaleDown>
        <SettingsToggleRow
          label={t("app.settings.displaySettings.createTabLabel")}
          description={t("app.settings.displaySettings.createTabDescription")}
          value={showAddTab}
          onToggle={(value) => setShowAddTab(value)}
        />
        <SettingsToggleRow
          label={t("app.settings.displaySettings.showEmptyHomeSectionsLabel")}
          description={t(
            "app.settings.displaySettings.showEmptyHomeSectionsDescription",
          )}
          value={showEmptyHomeSections}
          onToggle={(value) => setShowEmptyHomeSections(value)}
        />
        <SettingsSelectRow
          label={t("app.settings.displaySettings.homeSectionsLabel")}
          description={t(
            "app.settings.displaySettings.homeSectionsDescription",
          )}
          badgeText={t("app.settings.displaySettings.homeSectionsCount", {
            count: visibleHomeSectionCount,
          })}
          onPress={() => bottomSheetHomeSectionsModalRef.current?.present()}
        />
        <SettingsSelectRow
          label={t("app.settings.displaySettings.lyricsSourceLabel")}
          description={t(
            "app.settings.displaySettings.lyricsSourceDescription",
          )}
          badgeText={t(
            `app.settings.displaySettings.lyricsSourceOptions.${lyricsSource}`,
          )}
          onPress={() => bottomSheetLyricsSourceModalRef.current?.present()}
        />
        <SettingsSelectRow
          label={t("app.settings.displaySettings.swipeActionLabel")}
          description={t("app.settings.displaySettings.swipeActionDescription")}
          badgeText={t(
            `app.settings.displaySettings.swipeActionOptions.${swipeLeftAction}`,
          )}
          onPress={() => bottomSheetSwipeActionModalRef.current?.present()}
        />
        <Divider className="bg-primary-400" />
        <SettingsSectionTitle title={t("app.settings.hapticsSettings.title")} />
        <SettingsToggleRow
          label={t("app.settings.hapticsSettings.enabledLabel")}
          description={t("app.settings.hapticsSettings.enabledDescription")}
          value={hapticFeedbackEnabled}
          onToggle={(value) => setHapticFeedbackEnabled(value)}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
