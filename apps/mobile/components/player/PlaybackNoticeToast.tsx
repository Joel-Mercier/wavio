import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsToast } from "@/hooks/useSettingsToast";
import usePlaybackNotice, {
  type PlaybackNoticeCode,
} from "@/stores/playbackNotice";

// Renders the playback failures services/player.ts can't report itself.
//
// The player runs outside the React tree (it's started from index.js so Android
// Auto can boot it with no Activity), so it raises a code on the store and this
// component turns it into a toast. See stores/playbackNotice.ts.
const NOTICE_KEY: Record<PlaybackNoticeCode, string> = {
  PLAYBACK_SOURCE_UNAVAILABLE: "app.player.notices.sourceUnavailable",
  REMOTE_TRACK_REFUSED: "app.player.notices.remoteTrackRefused",
  REMOTE_LOST: "app.player.notices.remoteLost",
};

export default function PlaybackNoticeToast() {
  const { t } = useTranslation();
  const { showErrorToast } = useSettingsToast();
  const notice = usePlaybackNotice((s) => s.notice);
  const params = usePlaybackNotice((s) => s.params);

  useEffect(() => {
    if (!notice) return;
    showErrorToast(t(NOTICE_KEY[notice], params ?? undefined));
    // Clearing is what makes this fire once — `showErrorToast` is rebuilt every
    // render, so the effect re-runs freely and the guard above is what stops it.
    usePlaybackNotice.getState().clear();
  }, [notice, params, t, showErrorToast]);

  return null;
}
