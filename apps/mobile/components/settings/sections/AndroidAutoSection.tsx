import { useTranslation } from "react-i18next";
import {
  SettingsSectionTitle,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";
import useApp from "@/stores/app";

export default function AndroidAutoSection() {
  const { t } = useTranslation();
  const showFavorite = useApp((s) => s.showCarFavoriteButton);
  const setShowFavorite = useApp((s) => s.setShowCarFavoriteButton);
  const showShuffle = useApp((s) => s.showCarShuffleButton);
  const setShowShuffle = useApp((s) => s.setShowCarShuffleButton);
  const showRepeat = useApp((s) => s.showCarRepeatButton);
  const setShowRepeat = useApp((s) => s.setShowCarRepeatButton);

  return (
    <SettingsScreenScaffold title={t("app.settings.menu.androidAuto.title")}>
      <VStack>
        <SettingsSectionTitle
          title={t("app.settings.androidAutoSettings.playerButtonsTitle")}
        />
        <SettingsToggleRow
          label={t("app.settings.androidAutoSettings.favoriteButtonLabel")}
          description={t(
            "app.settings.androidAutoSettings.favoriteButtonDescription",
          )}
          value={showFavorite}
          onToggle={(value) => setShowFavorite(value)}
        />
        <SettingsToggleRow
          label={t("app.settings.androidAutoSettings.shuffleButtonLabel")}
          description={t(
            "app.settings.androidAutoSettings.shuffleButtonDescription",
          )}
          value={showShuffle}
          onToggle={(value) => setShowShuffle(value)}
        />
        <SettingsToggleRow
          label={t("app.settings.androidAutoSettings.repeatButtonLabel")}
          description={t(
            "app.settings.androidAutoSettings.repeatButtonDescription",
          )}
          value={showRepeat}
          onToggle={(value) => setShowRepeat(value)}
        />
      </VStack>
    </SettingsScreenScaffold>
  );
}
