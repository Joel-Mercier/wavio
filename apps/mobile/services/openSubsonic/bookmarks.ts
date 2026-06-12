import type { Bookmarks, PlayQueue } from "@/services/openSubsonic/types";
import openSubsonicApiInstance, {
  type OpenSubsonicResponse,
  subsonicEnvelope,
  subsonicRequest,
} from ".";

// Subsonic expresses bookmark / play-queue positions in milliseconds, but the
// rest of the app works in seconds (matching the audio engine and the Jellyfin
// adapter). Convert at this boundary so callers stay protocol-agnostic.
const toMs = (seconds: number) => Math.max(0, Math.round(seconds * 1000));
const toSeconds = (ms: number | undefined) =>
  ms == null ? 0 : Math.max(0, ms / 1000);

export const createBookmark = async (
  id: string,
  position: number,
  { comment }: { comment?: string },
) =>
  subsonicEnvelope(
    await openSubsonicApiInstance.post<
      OpenSubsonicResponse<Record<string, never>>
    >(
      "/rest/createBookmark",
      {},
      { params: { id, position: toMs(position), comment } },
    ),
  );

export const deleteBookmark = async (id: string) =>
  // Subsonic endpoints aren't REST — deleteBookmark.view is a regular GET with
  // the media `id` as a query param, not an HTTP DELETE (which some server
  // routers won't match).
  subsonicRequest<Record<string, never>>("/rest/deleteBookmark", { id });

export const getBookmarks = async () => {
  const envelope = await subsonicRequest<{ bookmarks: Bookmarks }>(
    "/rest/getBookmarks",
  );
  for (const bookmark of envelope.bookmarks?.bookmark ?? []) {
    bookmark.position = toSeconds(bookmark.position);
  }
  return envelope;
};

export const getPlayQueue = async () => {
  const envelope = await subsonicRequest<{ playQueue: PlayQueue }>(
    "/rest/getPlayQueue",
  );
  if (envelope.playQueue && typeof envelope.playQueue.position === "number") {
    envelope.playQueue.position = toSeconds(envelope.playQueue.position);
  }
  return envelope;
};

export const savePlayQueue = async ({
  ids,
  current,
  position,
}: {
  ids?: string[];
  current?: string;
  position?: number;
}) => {
  // Subsonic takes a repeated `id` param for each queue entry plus the
  // currently playing id and offset. Form-encode the body (repeated keys are
  // not expressible as a plain object) while auth params ride the query
  // string via the request interceptor.
  const body = new URLSearchParams();
  for (const trackId of ids ?? []) body.append("id", trackId);
  if (current != null) body.append("current", current);
  if (position != null) body.append("position", String(toMs(position)));
  return subsonicEnvelope(
    await openSubsonicApiInstance.post<
      OpenSubsonicResponse<Record<string, never>>
    >("/rest/savePlayQueue", body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }),
  );
};
