import { getCapabilities } from "@/services/backend/capabilities";
import { getLastFmSubmitEnabled } from "@/services/jellyfin/lastFm";
import { getLastFmLinkStatus } from "@/services/navidrome/lastFm";
import { getIsEffectivelyOnline } from "@/services/network";
import { useAuthBase } from "@/stores/auth";
import { type ServerScrobbleState, useLastFmBase } from "@/stores/lastFm";

/**
 * Asks the active server whether it is already scrobbling this user's plays to
 * Last.fm, and records the answer so the settings screen can warn about
 * double-counting.
 *
 * Resolves to `null` whenever the question can't be answered — an unsupported
 * backend, a non-admin Jellyfin session, or an unreachable server. Null is
 * deliberately distinct from `false`: it means "no warning", not "confirmed
 * nothing else is scrobbling".
 *
 * Unlike the Last.fm calls themselves, this one *does* need the music server, so
 * it checks effective connectivity.
 */
export async function refreshLastFmServerState(): Promise<ServerScrobbleState> {
  const { serverType } = useAuthBase.getState();
  if (!getCapabilities(serverType).serverLastFmLinkStatus) {
    useLastFmBase.getState().setServerIsScrobbling(null);
    return null;
  }
  // An unreachable server can't confirm the warning is still warranted, and a
  // stale `true` would keep claiming a link the user may have since removed.
  if (!getIsEffectivelyOnline()) {
    useLastFmBase.getState().setServerIsScrobbling(null);
    return null;
  }

  const state =
    serverType === "jellyfin"
      ? await getLastFmSubmitEnabled()
      : await getLastFmLinkStatus();
  useLastFmBase.getState().setServerIsScrobbling(state);
  return state;
}
