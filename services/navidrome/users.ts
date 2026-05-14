import navidromeApiInstance from "@/services/navidrome";
import type {
  NavidromeCreateUserBody,
  NavidromeUpdateUserBody,
  NavidromeUser,
} from "@/services/navidrome/types";

export const getUsers = async (): Promise<NavidromeUser[]> => {
  const rsp = await navidromeApiInstance.get<NavidromeUser[]>("/user");
  return rsp.data;
};

export const getUser = async (id: string): Promise<NavidromeUser> => {
  const rsp = await navidromeApiInstance.get<NavidromeUser>(
    `/user/${encodeURIComponent(id)}`,
  );
  return rsp.data;
};

export const createUser = async (
  body: NavidromeCreateUserBody,
): Promise<NavidromeUser> => {
  const rsp = await navidromeApiInstance.post<NavidromeUser>("/user", body);
  return rsp.data;
};

export const updateUser = async (
  id: string,
  body: NavidromeUpdateUserBody,
): Promise<NavidromeUser> => {
  const rsp = await navidromeApiInstance.put<NavidromeUser>(
    `/user/${encodeURIComponent(id)}`,
    body,
  );
  return rsp.data;
};

export const deleteUser = async (id: string): Promise<void> => {
  await navidromeApiInstance.delete(`/user/${encodeURIComponent(id)}`);
};
