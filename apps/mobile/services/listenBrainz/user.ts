import { useListenBrainzBase } from "@/stores/listenBrainz";

/**
 * The connected account's name, ready to drop into a path segment.
 *
 * Every per-user endpoint is keyed by name rather than by the token, so a call
 * made before the token has been validated has nothing to address — throwing
 * here turns that into a query error the screen can render, instead of a request
 * to `/1/user/undefined/...`.
 */
export function requireUserName(): string {
  const { userName } = useListenBrainzBase.getState();
  if (!userName) throw new Error("ListenBrainz: not connected");
  return encodeURIComponent(userName);
}
