import axios from "axios";
import { isSubsonicDataNotFound } from "@/services/openSubsonic";

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
