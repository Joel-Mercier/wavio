import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createShare,
  deleteShare,
  getShares,
  type ShareLinkOptions,
  updateShare,
} from "@/services/backend/sharing";

export const useCreateShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      params: {
        id: string;
        description?: string;
        expires?: number;
      } & ShareLinkOptions,
    ) => {
      const { id, ...options } = params;
      return createShare(id, options);
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
      downloadable?: boolean;
    }) => {
      const { id, ...options } = params;
      return updateShare(id, options);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares"] });
    },
  });
};
