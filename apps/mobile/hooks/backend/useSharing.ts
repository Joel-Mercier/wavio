import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createShare,
  deleteShare,
  getShares,
  updateShare,
} from "@/services/backend/sharing";

export const useCreateShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      description?: string;
      expires?: number;
    }) => {
      const { id, description, expires } = params;
      return createShare(id, { description, expires });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
};

export const useDeleteShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string }) => {
      const { id } = params;
      return deleteShare(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
};

export const useGetShares = () => {
  return useQuery({
    queryKey: ["shares"],
    queryFn: () => {
      return getShares();
    },
  });
};

export const useUpdateShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      description?: string;
      expires?: number;
    }) => {
      const { id, description, expires } = params;
      return updateShare(id, { description, expires });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
};
