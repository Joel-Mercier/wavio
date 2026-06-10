import { localEnvelope } from "@/services/local/unsupported";
import useLocalLibrary, { type StarTarget } from "@/stores/localLibrary";

// Local-backend media annotation. Star state has nowhere to live server-side, so
// it's kept in the local-library store (stores/localLibrary.ts) and surfaced
// back through getStarred/getStarred2 (services/local/lists.ts) and the `starred`
// field stamped by the mappers (services/local/mappers.ts).
//
// Rating / scrobble / playback reporting have no on-device equivalent; they
// resolve as no-ops so normal local playback never trips the "unsupported" path.

export const star = async (target: StarTarget) => {
  useLocalLibrary.getState().star(target);
  return localEnvelope({});
};

export const unstar = async (target: StarTarget) => {
  useLocalLibrary.getState().unstar(target);
  return localEnvelope({});
};

export const setRating = async (_id: string, _rating: number) => {
  return localEnvelope({});
};

export const scrobble = async (
  _id: string,
  _opts: { time?: number; submission?: boolean } = {},
) => {
  return localEnvelope({});
};

export const reportPlayback = async (_args: unknown) => {
  return localEnvelope({});
};
