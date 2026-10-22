import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import HomeSectionsSheet from "@/components/settings/HomeSectionsSheet";
import OptionsBottomSheetModal from "@/components/settings/OptionsBottomSheetModal";
import PlaylistFolderSeparatorField, {
  separatorExample,
} from "@/components/settings/PlaylistFolderSeparatorField";
import {
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsStepperRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { Divider } from "@/components/ui/divider";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { MAX_HOME_SHORTCUTS, MIN_HOME_SHORTCUTS } from "@/config/homeShortcuts";
import { LanguageNames, SupportedLanguages } from "@/config/i18n";
import { useHighlightedSetting } from "@/hooks/useHighlightedSetting";
import { useHomeSectionAvailability } from "@/hooks/useHomeSectionAvailability";
import useApp, { type SwipeAction } from "@/stores/app";
import { availableHomeSections } from "@/utils/homeFeed";
import { PLAYLIST_FOLDER_SEPARATOR_PRESETS } from "@/utils/playlistFolders";

const CUSTOM_SEPARATOR = "custom";

const swipeActionOptions: SwipeAction[] = [
  "off",
  "addToQueue",
  "playNext",
  "favorite",
  "rate",
  "showInfo",
  "addToPlaylist",
];

export default function AppearanceSection() {
  const { t } = useTranslation();
  const availability = useHomeSectionAvailability();
  // The home feed's footer card deep-links here pointing at the sections row.
  const {
    scrollRef,
    highlighted: highlightHomeSections,
    onLayout: handleHomeSectionsLayout,
  } = useHighlightedSetting("homeSections");

  const bottomSheetLanguageModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetSwipeActionModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetHomeSectionsModalRef = useRef<BottomSheetModal>(null);
  const bottomSheetSeparatorModalRef = useRef<BottomSheetModal>(null);

  const locale = useApp((store) => store.locale);
  const setLocale = useApp((store) => store.setLocale);
  const showAddTab = useApp((store) => store.showAddTab);
  const setShowAddTab = useApp((store) => store.setShowAddTab);
  const showEmptyHomeSections = useApp((store) => store.showEmptyHomeSections);
  const setShowEmptyHomeSections = useApp(
    (store) => store.setShowEmptyHomeSections,
  );
  const pinFavoritesShortcut = useApp((store) => store.pinFavoritesShortcut);
  const setPinFavoritesShortcut = useApp(
    (store) => store.setPinFavoritesShortcut,
  );
  const homeShortcutsCount = useApp((store) => store.homeShortcutsCount);
  const setHomeShortcutsCount = useApp((store) => store.setHomeShortcutsCount);
  const hiddenHomeSections = useApp((store) => store.hiddenHomeSections);
  const visibleHomeSectionCount = useMemo(
    () =>
      availableHomeSections(availability).filter(
        (entry) => !hiddenHomeSections.includes(entry.key),
      ).length,
    [availability, hiddenHomeSections],
  );
  const swipeLeftAction = useApp((store) => store.swipeLeftAction);
  const setSwipeLeftAction = useApp((store) => store.setSwipeLeftAction);
  const playlistFolderDetection = useApp(
    (store) => store.playlistFolderDetection,
  );
  const setPlaylistFolderDetection = useApp(
    (store) => store.setPlaylistFolderDetection,
  );
  const playlistFolderSeparator = useApp(
    (store) => store.playlistFolderSeparator,
  );
  const setPlaylistFolderSeparator = useApp(
    (store) => store.setPlaylistFolderSeparator,
  );
  const isPresetSeparator = (
    PLAYLIST_FOLDER_SEPARATOR_PRESETS as readonly string[]
  ).includes(playlistFolderSeparator);
  const [customSeparatorOpen, setCustomSeparatorOpen] = useState(
    !isPresetSeparator,
  );
  const handleSeparatorSelect = (value: string) => {
    if (value === CUSTOM_SEPARATOR) {
      setCustomSeparatorOpen(true);
      return;
    }
    setCustomSeparatorOpen(false);
    setPlaylistFolderSeparator(value);
  };
  const hapticFeedbackEnabled = useApp((store) => store.hapticFeedbackEnabled);
  const setHapticFeedbackEnabled = useApp(
    (store) => store.setHapticFeedbackEnabled,
  );

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.appearance.title")}
      scrollRef={scrollRef}
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
          <OptionsBottomSheetModal
            modalRef={bottomSheetSeparatorModalRef}
            header={t("app.settings.libraryDisplaySettings.separatorLabel")}
            headerDescription={t(
              "app.settings.libraryDisplaySettings.separatorDescription",
            )}
            options={[
              ...PLAYLIST_FOLDER_SEPARATOR_PRESETS.map((separator) => ({
                value: separator as string,
                label: separatorExample(separator),
              })),
              {
                value: CUSTOM_SEPARATOR,
                label: t("app.settings.libraryDisplaySettings.separatorCustom"),
              },
            ]}
            selectedValue={
              customSeparatorOpen ? CUSTOM_SEPARATOR : playlistFolderSeparator
            }
            onSelect={handleSeparatorSelect}
            dismissOnSelect
          />
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
        <Box onLayout={handleHomeSectionsLayout}>
          <SettingsSelectRow
            label={t("app.settings.displaySettings.homeSectionsLabel")}
            description={t(
              "app.settings.displaySettings.homeSectionsDescription",
            )}
            badgeText={t("app.settings.displaySettings.homeSectionsCount", {
              count: visibleHomeSectionCount,
            })}
            highlighted={highlightHomeSections}
            onPress={() => bottomSheetHomeSectionsModalRef.current?.present()}
          />
        </Box>
        <SettingsToggleRow
          label={t("app.settings.displaySettings.pinFavoritesShortcutLabel")}
          description={t(
            "app.settings.displaySettings.pinFavoritesShortcutDescription",
          )}
          value={pinFavoritesShortcut}
          onToggle={(value) => setPinFavoritesShortcut(value)}
        />
        <SettingsStepperRow
          label={t("app.settings.displaySettings.homeShortcutsCountLabel")}
          description={t(
            "app.settings.displaySettings.homeShortcutsCountDescription",
          )}
          valueText={String(homeShortcutsCount)}
          valueClassName="w-6"
          onDecrement={() => setHomeShortcutsCount(homeShortcutsCount - 2)}
          onIncrement={() => setHomeShortcutsCount(homeShortcutsCount + 2)}
          decrementDisabled={homeShortcutsCount <= MIN_HOME_SHORTCUTS}
          incrementDisabled={homeShortcutsCount >= MAX_HOME_SHORTCUTS}
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
        <SettingsSectionTitle
          title={t("app.settings.libraryDisplaySettings.title")}
        />
        <SettingsToggleRow
          label={t("app.settings.libraryDisplaySettings.playlistFoldersLabel")}
          description={t(
            "app.settings.libraryDisplaySettings.playlistFoldersDescription",
            { example: separatorExample(playlistFolderSeparator) },
          )}
          value={playlistFolderDetection}
          onToggle={(value) => setPlaylistFolderDetection(value)}
        />
        {playlistFolderDetection && (
          <>
            <SettingsSelectRow
              label={t("app.settings.libraryDisplaySettings.separatorLabel")}
              description={t(
                "app.settings.libraryDisplaySettings.separatorDescription",
              )}
              badgeText={separatorExample(playlistFolderSeparator)}
              onPress={() => bottomSheetSeparatorModalRef.current?.present()}
            />
            {customSeparatorOpen && (
              <PlaylistFolderSeparatorField
                value={playlistFolderSeparator}
                onSave={setPlaylistFolderSeparator}
              />
            )}
          </>
        )}
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
