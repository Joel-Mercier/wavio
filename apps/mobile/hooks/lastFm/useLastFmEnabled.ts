import { hasLastFmCredentials } from "@/services/lastFm/config";
import useLastFm from "@/stores/lastFm";

/**
 * Gate shared by every Last.fm read query.
 *
 * The name is part of every query key as well as every request, so switching
 * accounts can't serve the previous one's cached answers. Subscribing to the
 * store field (rather than reading the non-reactive `isLastFmConnected`
 * selector) is what makes a screen fetch the moment an account is connected.
 *
 * `sessionInvalid` deliberately isn't consulted: every read method takes the api
 * key alone, so a revoked session stops writes and leaves reads working.
 */
export function useLastFmEnabled(enabled: boolean) {
  const userName = useLastFm((store) => store.userName);
  return {
    userName,
    isEnabled: enabled && !!userName && hasLastFmCredentials(),
  };
}
