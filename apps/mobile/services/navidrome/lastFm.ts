import navidromeApiInstance from "@/services/navidrome";

type LinkStatusResponse = { status?: boolean };

/**
 * Whether this Navidrome user has linked their Last.fm account server-side, in
 * which case Navidrome is already scrobbling their plays and the app doing it
 * too would count every play twice.
 *
 * Returns `null` when the question couldn't be answered — an older server 404s,
 * and that is "unknown", not "no". Callers treat null as "show no warning"
 * rather than "safe to assume nothing is scrobbling".
 *
 * The route also reports the server's own Last.fm API key (Navidrome ships no
 * bundled one, so an empty key means the admin never configured Last.fm at all),
 * but that doesn't change the answer: either way this user is not linked. It is
 * deliberately not read — the key has no use here and no reason to be touched.
 */
export const getLastFmLinkStatus = async (): Promise<boolean | null> => {
  try {
    const rsp =
      await navidromeApiInstance.get<LinkStatusResponse>("/lastfm/link");
    return rsp.data?.status === true;
  } catch {
    return null;
  }
};
