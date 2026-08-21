import { useMemo } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import useListenBrainz from "@/stores/listenBrainz";
import type { HomeSectionAvailability } from "@/utils/homeFeed";

/**
 * What the home feed and the section picker both need to know: which sections
 * this server and this user's connected accounts can actually produce.
 *
 * The ListenBrainz flag subscribes to the two store fields rather than calling
 * the `isListenBrainzConnected` selector, which reads state without
 * subscribing — the settings sheet has to re-render the moment a token is
 * validated, not on the next unrelated render.
 */
export function useHomeSectionAvailability(): HomeSectionAvailability {
  const capabilities = useCapabilities();
  const userName = useListenBrainz((store) => store.userName);
  const token = useListenBrainz((store) => store.token);
  const listenBrainz = !!userName && token.length > 0;

  return useMemo(
    () => ({ capabilities, integrations: { listenBrainz } }),
    [capabilities, listenBrainz],
  );
}
