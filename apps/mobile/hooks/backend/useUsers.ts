import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  changePassword,
  getUser,
  getUsers,
  type UpdateUserParams,
  updateUser,
} from "@/services/backend/users";

export const useUsers = (options?: { enabled?: boolean }) => {
  // The users section (getUser/getUsers) has no on-device implementation, so the
  // local backend throws LocalUnsupportedError. Gate the query off rather than
  // letting it fail. `adminUsers` is the section's capability — true for every
  // remote backend, false only for local.
  const { adminUsers } = useCapabilities();
  return useQuery({
    queryKey: ["users"],
    queryFn: () => {
      return getUsers();
    },
    enabled: (options?.enabled ?? true) && adminUsers,
  });
};

export const useGetUser = (username: string) => {
  const { adminUsers } = useCapabilities();
  return useQuery({
    queryKey: ["getUser", username],
    queryFn: () => {
      return getUser(username);
    },
    enabled: !!username && adminUsers,
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
    mutationFn: (params: {
      username: string;
      password: string;
      currentPassword?: string;
    }) => {
      return changePassword(params);
    },
  });
};
