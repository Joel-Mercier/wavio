import { useTranslation } from "react-i18next";
import RemoteResumeDialog from "@/components/player/RemoteResumeDialog";
import {
  reattach as reattachJukebox,
  takeOverLocally as takeOverJukeboxLocally,
} from "@/services/jukebox";
import {
  reattach as reattachUpnp,
  takeOverLocally as takeOverUpnpLocally,
} from "@/services/upnp";
import useJukebox from "@/stores/jukebox";
import useUpnp from "@/stores/upnp";
import { logError } from "@/utils/log";

// The launch checks (services/jukebox initJukeboxOnLaunch, services/upnp
// initUpnpOnLaunch) run in sequence and the second stands down when the first
// found a session, so at most one of these is ever open.
export default function ResumeDialogs() {
  const { t } = useTranslation();
  const jukeboxPending = useJukebox((s) => s.pendingResume);
  const setJukeboxPending = useJukebox((s) => s.setPendingResume);
  const upnpPending = useUpnp((s) => s.pendingResume);
  const setUpnpPending = useUpnp((s) => s.setPendingResume);
  const upnpDeviceName = useUpnp((s) => s.session?.deviceName ?? "");

  return (
    <>
      <RemoteResumeDialog
        isOpen={jukeboxPending}
        title={t("app.player.jukeboxResumeTitle")}
        message={t("app.player.jukeboxResumeMessage")}
        resumeLabel={t("app.player.jukeboxResumeResume")}
        playHereLabel={t("app.player.jukeboxResumePlayHere")}
        onResume={() => {
          setJukeboxPending(false);
          reattachJukebox().catch(logError);
        }}
        onPlayHere={() => {
          setJukeboxPending(false);
          takeOverJukeboxLocally().catch(logError);
        }}
        onClose={() => setJukeboxPending(false)}
      />
      <RemoteResumeDialog
        isOpen={upnpPending}
        title={t("app.player.upnpResumeTitle", { name: upnpDeviceName })}
        message={t("app.player.upnpResumeMessage", { name: upnpDeviceName })}
        resumeLabel={t("app.player.jukeboxResumeResume")}
        playHereLabel={t("app.player.jukeboxResumePlayHere")}
        onResume={() => {
          setUpnpPending(false);
          reattachUpnp().catch(logError);
        }}
        onPlayHere={() => {
          setUpnpPending(false);
          takeOverUpnpLocally().catch(logError);
        }}
        onClose={() => setUpnpPending(false)}
      />
    </>
  );
}
