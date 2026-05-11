import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  changePassword,
  getUser,
  getUsers,
  type UpdateUserParams,
  updateUser,
} from "@/services/openSubsonic/users";

export const useUsers = () => {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => {
      return getUsers();
    },
  });
};

export const useGetUser = (username: string) => {
  return useQuery({
    queryKey: ["getUser", username],
    queryFn: () => {
      return getUser(username);
    },
    enabled: !!username,
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: UpdateUserParams) => {
      return updateUser(params);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["getUser", variables.username],
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};

export const useChangePassword = () => {
  return useMutation({
    mutationFn: (params: { username: string; password: string }) => {
      return changePassword(params);
    },
  });
};
