import type { AxiosRequestConfig } from "axios";
import jellyfinApiInstance from "@/services/jellyfin";
import { useAuthBase } from "@/stores/auth";

// jellyfin-plugin-listenbrainz's plugin id (Plugin.cs). Stable across the
// plugin's releases; a rename would surface as a 404, which we treat as
// "not installed".
const LISTENBRAINZ_PLUGIN_ID = "59B20823-AAFE-454C-A393-17427F518631";

/**
 * Whether the Jellyfin server is already submitting this user's listens to
 * ListenBrainz via jellyfin-plugin-listenbrainz.
 *
 * `null` means "couldn't tell" and is the common case: the plugin configuration
 * endpoint requires elevation, so only an admin session gets an answer. A
 * non-admin is not an error condition — it's simply a question we can't ask.
 *
 * SECURITY: the response body is a plugin configuration, which embeds **every**
 * user's ListenBrainz API token in plain text. Nothing here may let it escape —
 * it is never logged, never persisted, and never handed to reportError (whose
 * axios errors carry `response.data`). The two fields we need are read out and
 * the rest is dropped on the floor; failures are swallowed rather than reported
 * for exactly this reason.
 */
export const getListenBrainzSubmitEnabled = async (): Promise<
  boolean | null
> => {
  const { isAdmin, jellyfinUserId } = useAuthBase.getState();
  if (!isAdmin || !jellyfinUserId) return null;
  try {
    const rsp = await jellyfinApiInstance.get<{
      UserConfigs?: {
        JellyfinUserId?: string;
        IsListenSubmitEnabled?: boolean;
      }[];
      // A 404 here *is* the answer: the ListenBrainz plugin isn't installed,
      // which the catch below reads as "definitively not scrobbling".
    }>(`/Plugins/${LISTENBRAINZ_PLUGIN_ID}/Configuration`, {
      notFoundIsExpected: true,
    } as AxiosRequestConfig & { notFoundIsExpected?: boolean });
    const configs = rsp.data?.UserConfigs;
    if (!Array.isArray(configs)) return null;
    // Jellyfin ids are hex GUIDs that the server may render dashed or not
    // depending on the endpoint, so compare them normalised.
    const target = jellyfinUserId.replaceAll("-", "").toLowerCase();
    const match = configs.find(
      (config) =>
        typeof config?.JellyfinUserId === "string" &&
        config.JellyfinUserId.replaceAll("-", "").toLowerCase() === target,
    );
    // Plugin installed but this user was never configured in it: it is not
    // scrobbling for them.
    if (!match) return false;
    return match.IsListenSubmitEnabled === true;
  } catch (error) {
    // 404 => the plugin isn't installed, so the server is definitively not
    // scrobbling. Anything else (403 for a non-elevated token, a network blip)
    // stays unknown. Read only the status; never touch the body.
    const status = (error as { response?: { status?: number } } | undefined)
      ?.response?.status;
    return status === 404 ? false : null;
  }
};
