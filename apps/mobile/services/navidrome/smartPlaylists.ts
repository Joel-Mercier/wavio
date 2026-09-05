import navidromeApiInstance from "@/services/navidrome";
import type { NavidromePlaylist } from "@/services/navidrome/types";

export type StringOperator =
  | "is"
  | "isNot"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith";
export type NumberOperator = "is" | "isNot" | "gt" | "lt" | "inTheRange";
export type DateOperator = "before" | "after" | "inTheLast" | "notInTheLast";
export type BooleanOperator = "is";
export type PlaylistRefOperator = "inPlaylist" | "notInPlaylist";
// Tag/role presence operators added in Navidrome v0.62.0.
export type TagPresenceOperator = "isMissing" | "isPresent";

export type SmartPlaylistOperator =
  | StringOperator
  | NumberOperator
  | DateOperator
  | BooleanOperator
  | PlaylistRefOperator
  | TagPresenceOperator;

export type SmartPlaylistRuleValue =
  | string
  | number
  | boolean
  | [number, number]
  | { id: string };

export type SmartPlaylistRule = {
  [op in SmartPlaylistOperator]?: Record<string, SmartPlaylistRuleValue>;
};

// Navidrome nests conjunctions to any depth (a rule slot accepts an `all`/`any`
// group as well as an operator), supported since v0.47.0.
export type SmartPlaylistRuleGroup =
  | { all: SmartPlaylistNode[] }
  | { any: SmartPlaylistNode[] };

export type SmartPlaylistNode = SmartPlaylistRule | SmartPlaylistRuleGroup;

export interface SmartPlaylistCriteria {
  all?: SmartPlaylistNode[];
  any?: SmartPlaylistNode[];
  sort?: string;
  order?: string;
  limit?: number;
  // Go duration with Navidrome's `d`/`w` extensions ("12h", "1d", "1w",
  // "1d12h"), added in v0.64.0. Absent = the server's global
  // SmartPlaylistRefreshDelay (5s by default), i.e. re-evaluated on every read.
  refreshDelay?: string;
  // Criteria keys the rule editor doesn't model but must not destroy on save:
  // Navidrome re-serializes the whole criteria blob, so anything we omit from
  // an update is gone from the playlist. Named for documentation only — the
  // serializer carries them, and any key added by a future server, through the
  // index signature rather than by name.
  limitPercent?: number;
  offset?: number;
  [key: string]: unknown;
}

export interface SmartPlaylistBody {
  name: string;
  comment?: string;
  public?: boolean;
  rules: SmartPlaylistCriteria;
}

export const createSmartPlaylist = async (
  body: SmartPlaylistBody,
): Promise<NavidromePlaylist> => {
  const rsp = await navidromeApiInstance.post<NavidromePlaylist>(
    "/playlist",
    body,
  );
  return rsp.data;
};

export const updateSmartPlaylist = async (
  id: string,
  body: SmartPlaylistBody,
): Promise<NavidromePlaylist> => {
  const rsp = await navidromeApiInstance.put<NavidromePlaylist>(
    `/playlist/${id}`,
    body,
  );
  return rsp.data;
};

export const getSmartPlaylist = async (
  id: string,
): Promise<NavidromePlaylist> => {
  const rsp = await navidromeApiInstance.get<NavidromePlaylist>(
    `/playlist/${id}`,
  );
  return rsp.data;
};
