import {
  createShare,
  deleteShare,
  getShares,
  updateShare,
} from "@/services/openSubsonic/sharing";
import { useMutation, useQuery } from "@tanstack/react-query";

export const useCreateShare = () => {
  return useMutation({
    mutationFn: (params: {
      id: string;
      description?: string;
      expires?: number;
    }) => {
      const { id, description, expires } = params;
      return createShare(id, { description, expires });
    },
  });
};

export const useDeleteShare = () => {
  return useMutation({
    mutationFn: (params: { id: string }) => {
      const { id } = params;
      return deleteShare(id);
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
  return useMutation({
    mutationFn: (params: {
      id: string;
      description?: string;
      expires?: number;
    }) => {
      const { id, description, expires } = params;
      return updateShare(id, { description, expires });
    },
  });
};
