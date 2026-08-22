import navidromeApiInstance from "@/services/navidrome";

type LinkStatusResponse = { status?: boolean };

/**
 * Whether this Navidrome user has linked a ListenBrainz token server-side, in
 * which case Navidrome is already scrobbling their plays and the app doing it
 * too would count every play twice.
 *
 * Returns `null` when the question couldn't be answered — the route is only
 * mounted when `ND_LISTENBRAINZ_ENABLED` is on, so an older or opted-out server
 * 404s, and that is "unknown", not "no". Callers treat null as "show no
 * warning" rather than "safe to assume nothing is scrobbling".
 */
export const getListenBrainzLinkStatus = async (): Promise<boolean | null> => {
  try {
    const rsp =
      await navidromeApiInstance.get<LinkStatusResponse>("/listenbrainz/link");
    return rsp.data?.status === true;
  } catch {
    return null;
  }
};
