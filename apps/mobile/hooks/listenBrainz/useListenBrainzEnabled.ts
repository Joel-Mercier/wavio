import useListenBrainz from "@/stores/listenBrainz";

/**
 * Gate shared by every ListenBrainz query: the account's name, and whether it is
 * worth asking at all.
 *
 * The name is part of every query key as well as every URL, so that switching
 * accounts can't serve the previous one's cached answers. Subscribing to the two
 * store fields (rather than reading the non-reactive `isListenBrainzConnected`
 * selector) is what makes a screen refetch the moment a token is validated.
 */
export function useListenBrainzEnabled(enabled: boolean) {
  const userName = useListenBrainz((store) => store.userName);
  const token = useListenBrainz((store) => store.token);
  return {
    userName,
    isEnabled: enabled && !!userName && token.length > 0,
  };
}
