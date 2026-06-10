import { recordPlay } from "@/services/local/repository";
import { localEnvelope } from "@/services/local/unsupported";
import useLocalLibrary, { type StarTarget } from "@/stores/localLibrary";

// Local-backend media annotation. With no server, user-curated state lives
// on-device: star state and ratings in the local-library store
// (stores/localLibrary.ts), play counts / last-played in SQLite (track_stats).
// Both surface back through the list endpoints (services/local/lists.ts) and the
// fields the mappers stamp (services/local/mappers.ts).
//
// Playback reporting (the OpenSubsonic playbackReport extension) has no on-device
// equivalent and the local backend never advertises the extension, so the player
// uses the classic scrobble flow; reportPlayback resolves as a no-op.

export const star = async (target: StarTarget) => {
  useLocalLibrary.getState().star(target);
  return localEnvelope({});
};

export const unstar = async (target: StarTarget) => {
  useLocalLibrary.getState().unstar(target);
  return localEnvelope({});
};

export const setRating = async (id: string, rating: number) => {
  useLocalLibrary.getState().setRating(id, rating);
  return localEnvelope({});
};

export const scrobble = async (
  id: string,
  { time, submission }: { time?: number; submission?: boolean } = {},
) => {
  // Mirror Subsonic semantics: only a submission counts as a play; submission:
  // false is the now-playing ping. time is when playback started (epoch-ms).
  if (submission) await recordPlay(id, time ?? Date.now());
  return localEnvelope({});
};

export const reportPlayback = async (_args: unknown) => {
  return localEnvelope({});
};
