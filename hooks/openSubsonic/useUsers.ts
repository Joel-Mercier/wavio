import { useQuery } from "@tanstack/react-query";
import { getUser, getUsers } from "@/services/openSubsonic/users";

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
  });
};
