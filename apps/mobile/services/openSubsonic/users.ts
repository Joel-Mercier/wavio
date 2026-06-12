import { subsonicRequest } from "@/services/openSubsonic/index";
import type { User, Users } from "@/services/openSubsonic/types";

export interface UpdateUserParams {
  username: string;
  password?: string;
  email?: string;
  ldapAuthenticated?: boolean;
  adminRole?: boolean;
  settingsRole?: boolean;
  streamRole?: boolean;
  jukeboxRole?: boolean;
  downloadRole?: boolean;
  uploadRole?: boolean;
  playlistRole?: boolean;
  coverArtRole?: boolean;
  commentRole?: boolean;
  podcastRole?: boolean;
  shareRole?: boolean;
  videoConversionRole?: boolean;
  scrobblingEnabled?: boolean;
  musicFolderId?: number | number[];
  maxBitRate?: number;
}

export const getUser = async (username: string) =>
  subsonicRequest<{ user: User }>("/rest/getUser", { username });

export const getUsers = async () =>
  subsonicRequest<{ users: Users }>("/rest/getUsers");

export const updateUser = async (params: UpdateUserParams) =>
  subsonicRequest<Record<string, never>>(
    "/rest/updateUser",
    { ...params },
    { paramsSerializer: { indexes: null } },
  );

export const changePassword = async (params: {
  username: string;
  password: string;
  currentPassword?: string;
}) => {
  const { currentPassword: _currentPassword, ...subsonicParams } = params;
  return subsonicRequest<Record<string, never>>(
    "/rest/changePassword",
    subsonicParams,
  );
};
