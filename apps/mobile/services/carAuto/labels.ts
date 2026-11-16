import i18n from "@/config/i18n";
import { CarAutoBridge } from "./bridge";
import { t } from "./nodes";

export function pushLabels() {
  CarAutoBridge.setLabels({
    favoriteAdd: t("buttons.favoriteAdd"),
    favoriteRemove: t("buttons.favoriteRemove"),
    shuffleOn: t("buttons.shuffleOn"),
    shuffleOff: t("buttons.shuffleOff"),
    repeatAll: t("buttons.repeatAll"),
    repeatOne: t("buttons.repeatOne"),
    repeatOff: t("buttons.repeatOff"),
    radio: t("buttons.radio"),
    seekBack: t("buttons.seekBack"),
    seekForward: t("buttons.seekForward"),
    actionFavoriteAdd: t("itemActions.favoriteAdd"),
    actionFavoriteRemove: t("itemActions.favoriteRemove"),
    actionRadio: t("itemActions.radio"),
    actionPlayNext: t("itemActions.playNext"),
    actionAddToQueue: t("itemActions.addToQueue"),
    actionShuffle: t("itemActions.shuffle"),
    actionDownload: t("itemActions.download"),
  });
}

let started = false;

export function startLabels() {
  if (started || !CarAutoBridge.available) return;
  started = true;
  pushLabels();
  i18n.on("languageChanged", pushLabels);
}
