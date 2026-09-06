import type { AxiosRequestConfig } from "axios";
import jellyfinApiInstance from "@/services/jellyfin";
import { useAuthBase } from "@/stores/auth";

// jellyfin-plugin-lastfm ships under two ids. The original (jesseward) was
// archived in February 2026 and the community moved to danielfariati's fork,
// which changed the plugin GUID — so both have to be asked, newest first. A
// rename beyond these surfaces as a 404, which we read as "not installed".
const LASTFM_PLUGIN_IDS = [
  "5e7fe7f0-b048-429e-a431-b1a7e69c930d", // danielfariati (active fork)
  "de7fe7f0-b048-439e-a431-b1a7e99c930d", // jesseward (archived original)
];

type LastFmPluginConfig = {
  LastfmUsers?: {
    MediaBrowserUserId?: string;
    Options?: { Scrobble?: boolean };
  }[];
};

/**
 * Whether the Jellyfin server is already submitting this user's plays to
 * Last.fm via jellyfin-plugin-lastfm.
 *
 * `null` means "couldn't tell" and is the common case: the plugin configuration
 * endpoint requires elevation, so only an admin session gets an answer. A
 * non-admin is not an error condition — it's simply a question we can't ask.
 *
 * SECURITY: the response body is a plugin configuration, which embeds **every**
 * user's Last.fm session key in plain text. Nothing here may let it escape — it
 * is never logged, never persisted, and never handed to reportError (whose axios
 * errors carry `response.data`). The one field we need is read out and the rest
 * is dropped on the floor; failures are swallowed rather than reported for
 * exactly this reason.
 */
export const getLastFmSubmitEnabled = async (): Promise<boolean | null> => {
  const { isAdmin, jellyfinUserId } = useAuthBase.getState();
  if (!isAdmin || !jellyfinUserId) return null;

  // Jellyfin ids are hex GUIDs the server may render dashed or not depending on
  // the endpoint, so compare them normalised.
  const target = jellyfinUserId.replaceAll("-", "").toLowerCase();

  for (const pluginId of LASTFM_PLUGIN_IDS) {
    try {
      const rsp = await jellyfinApiInstance.get<LastFmPluginConfig>(
        `/Plugins/${pluginId}/Configuration`,
        // A 404 here *is* an answer: this build of the plugin isn't installed.
        { notFoundIsExpected: true } as AxiosRequestConfig & {
          notFoundIsExpected?: boolean;
        },
      );
      const users = rsp.data?.LastfmUsers;
      if (!Array.isArray(users)) continue;
      const match = users.find(
        (user) =>
          typeof user?.MediaBrowserUserId === "string" &&
          user.MediaBrowserUserId.replaceAll("-", "").toLowerCase() === target,
      );
      if (match) return match.Options?.Scrobble === true;
      // Installed but this user was never configured in it: it is not scrobbling
      // for them. Keep looking in case the other build is the configured one.
    } catch (error) {
      // 404 => this plugin id isn't installed; try the other. Anything else
      // (403 for a non-elevated token, a network blip) leaves the whole question
      // unanswered. Read only the status; never touch the body.
      const status = (error as { response?: { status?: number } } | undefined)
        ?.response?.status;
      if (status !== 404) return null;
    }
  }

  // Reached when every id either 404'd (no build of the plugin is installed) or
  // answered without this user in it (installed, but not configured for them).
  // Both mean the same thing: the server is not scrobbling this user's plays.
  return false;
};
