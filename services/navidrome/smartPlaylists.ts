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

export type SmartPlaylistOperator =
  | StringOperator
  | NumberOperator
  | DateOperator
  | BooleanOperator
  | PlaylistRefOperator;

export type SmartPlaylistRuleValue =
  | string
  | number
  | boolean
  | [number, number]
  | { id: string };

export type SmartPlaylistRule = {
  [op in SmartPlaylistOperator]?: Record<string, SmartPlaylistRuleValue>;
};

export interface SmartPlaylistCriteria {
  all?: SmartPlaylistRule[];
  any?: SmartPlaylistRule[];
  sort?: string;
  order?: string;
  limit?: number;
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
