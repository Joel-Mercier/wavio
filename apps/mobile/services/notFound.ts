import axios from "axios";
import {
  isSubsonicDataNotFound,
  isSubsonicNotAuthorized,
} from "@/services/openSubsonic";

/**
 * "The thing you asked about isn't there", across every backend: Subsonic error
 * code 70, and the HTTP 404 that Jellyfin / WebDAV / SMB answer with.
 *
 * For a delete it means the requested end state already holds, so callers treat
 * it as success rather than as a failure worth surfacing.
 */
export const isNotFoundError = (error: unknown): boolean =>
  isSubsonicDataNotFound(error) ||
  (axios.isAxiosError(error) && error.response?.status === 404);

/**
 * "Retrying this write will fail the same way": the target is gone (404 /
 * Subsonic code 70) or this user may not write to it (403 / Subsonic code 50).
 * A timeout, a 5xx or a dropped connection is none of those and may well
 * succeed next time, so callers that discard state on failure — a remembered
 * shortcut, a cached target — must only discard it for this.
 */
export const isPermanentWriteRefusal = (error: unknown): boolean =>
  isNotFoundError(error) ||
  isSubsonicNotAuthorized(error) ||
  (axios.isAxiosError(error) && error.response?.status === 403);
