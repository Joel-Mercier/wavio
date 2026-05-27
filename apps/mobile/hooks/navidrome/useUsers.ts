import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  NavidromeCreateUserBody,
  NavidromeUpdateUserBody,
} from "@/services/navidrome/types";
import {
  createUser,
  deleteUser,
  getUser,
  getUsers,
  updateUser,
} from "@/services/navidrome/users";

const usersKey = ["nd", "users"] as const;
const userKey = (id: string) => ["nd", "user", id] as const;

export const useUsers = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: usersKey,
    queryFn: getUsers,
    enabled: options?.enabled ?? true,
  });
};

export const useGetUser = (id: string | null | undefined) => {
  return useQuery({
    queryKey: userKey(id ?? ""),
    queryFn: () => getUser(id as string),
    enabled: !!id,
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NavidromeCreateUserBody) => createUser(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: NavidromeUpdateUserBody }) =>
      updateUser(id, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: userKey(variables.id) });
      queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKey });
    },
  });
};
