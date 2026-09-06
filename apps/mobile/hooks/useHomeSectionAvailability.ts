import { useMemo } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { hasLastFmCredentials } from "@/services/lastFm/config";
import useLastFm from "@/stores/lastFm";
import useListenBrainz from "@/stores/listenBrainz";
import type { HomeSectionAvailability } from "@/utils/homeFeed";

/**
 * What the home feed and the section picker both need to know: which sections
 * this server and this user's connected accounts can actually produce.
 *
 * The ListenBrainz flag subscribes to the two store fields rather than calling
 * the `isListenBrainzConnected` selector, which reads state without
 * subscribing — the settings sheet has to re-render the moment a token is
 * validated, not on the next unrelated render. The Last.fm flag does the same,
 * and also checks the build's API credentials: without them nothing can be
 * fetched, so offering the section would be a dead row.
 */
export function useHomeSectionAvailability(): HomeSectionAvailability {
  const capabilities = useCapabilities();
  const userName = useListenBrainz((store) => store.userName);
  const token = useListenBrainz((store) => store.token);
  const listenBrainz = !!userName && token.length > 0;
  const lastFmUserName = useLastFm((store) => store.userName);
  const lastFmSessionKey = useLastFm((store) => store.sessionKey);
  const lastFm =
    !!lastFmUserName && lastFmSessionKey.length > 0 && hasLastFmCredentials();

  return useMemo(
    () => ({ capabilities, integrations: { listenBrainz, lastFm } }),
    [capabilities, listenBrainz, lastFm],
  );
}
