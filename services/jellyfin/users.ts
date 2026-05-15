import jellyfinApiInstance from "@/services/jellyfin/index";
import { mapJellyfinUser } from "@/services/jellyfin/mappers";
import { fakeEnvelope } from "@/services/jellyfin/unsupported";
import type { User, Users } from "@/services/openSubsonic/types";
import type { UpdateUserParams } from "@/services/openSubsonic/users";

type JellyfinUser = {
  Id: string;
  Name: string;
  Policy?: { IsAdministrator?: boolean };
};

export const getUsers = async () => {
  const rsp = await jellyfinApiInstance.get<JellyfinUser[]>("/Users");
  const list: Users = { user: (rsp.data ?? []).map(mapJellyfinUser) };
  return fakeEnvelope({ users: list });
};

export const getUser = async (username: string) => {
  const rsp = await jellyfinApiInstance.get<JellyfinUser[]>("/Users");
  const match = (rsp.data ?? []).find((u) => u.Name === username);
  const user: User = match
    ? mapJellyfinUser(match)
    : {
        username,
        adminRole: false,
        commentRole: false,
        coverArtRole: false,
        downloadRole: true,
        jukeboxRole: false,
        playlistRole: true,
        podcastRole: false,
        scrobblingEnabled: true,
        settingsRole: false,
        shareRole: false,
        streamRole: true,
        uploadRole: false,
        videoConversionRole: false,
      };
  return fakeEnvelope({ user });
};

export const updateUser = async (_params: UpdateUserParams) => {
  // Jellyfin user updates require admin API surface; not exposed in this
  // adapter v1.
  return fakeEnvelope({});
};

export const changePassword = async (params: {
  username: string;
  password: string;
}) => {
  // Find user by name then call /Users/{Id}/Password
  const rsp = await jellyfinApiInstance.get<JellyfinUser[]>("/Users");
  const match = (rsp.data ?? []).find((u) => u.Name === params.username);
  if (match) {
    await jellyfinApiInstance.post(`/Users/${match.Id}/Password`, {
      NewPw: params.password,
    });
  }
  return fakeEnvelope({});
};
