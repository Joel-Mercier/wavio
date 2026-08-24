import { getCapabilities } from "@/services/backend/capabilities";
import { getListenBrainzSubmitEnabled } from "@/services/jellyfin/listenBrainz";
import { getListenBrainzLinkStatus } from "@/services/navidrome/listenBrainz";
import { getIsEffectivelyOnline } from "@/services/network";
import { useAuthBase } from "@/stores/auth";
import {
  type ServerScrobbleState,
  useListenBrainzBase,
} from "@/stores/listenBrainz";

/**
 * Asks the active server whether it is already scrobbling this user's plays to
 * ListenBrainz, and records the answer so the settings screen can warn about
 * double-counting.
 *
 * Resolves to `null` whenever the question can't be answered — an unsupported
 * backend, a non-admin Jellyfin session, or an unreachable server. Null is
 * deliberately distinct from `false`: it means "no warning", not "confirmed
 * nothing else is scrobbling".
 *
 * Unlike the ListenBrainz calls themselves, this one *does* need the music
 * server, so it checks effective connectivity.
 */
export async function refreshServerScrobbleState(): Promise<ServerScrobbleState> {
  const { serverType } = useAuthBase.getState();
  if (!getCapabilities(serverType).serverScrobbleLinkStatus) {
    useListenBrainzBase.getState().setServerIsScrobbling(null);
    return null;
  }
  // An unreachable server can't confirm the warning is still warranted, and a
  // stale `true` would keep claiming a link the user may have since removed.
  if (!getIsEffectivelyOnline()) {
    useListenBrainzBase.getState().setServerIsScrobbling(null);
    return null;
  }

  const state =
    serverType === "jellyfin"
      ? await getListenBrainzSubmitEnabled()
      : await getListenBrainzLinkStatus();
  useListenBrainzBase.getState().setServerIsScrobbling(state);
  return state;
}
